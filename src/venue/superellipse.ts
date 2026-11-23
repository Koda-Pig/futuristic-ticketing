// Closed curves in the ground plane, as (x, z) pairs. Points run from polar
// angle 0° (+X) towards +Z, so the polar angle increases along the curve.

export type Curve = {
  /** Interleaved x, z. */
  points: Float64Array;
  /** Interleaved outward unit normals. */
  normals: Float64Array;
  /** Arc length at each point; the closing segment adds up to `length`. */
  arc: Float64Array;
  length: number;
};

const signedPow = (value: number, power: number) =>
  Math.sign(value) * Math.abs(value) ** power;

function arcLengths(points: Float64Array) {
  const count = points.length / 2;
  const arc = new Float64Array(count);
  let length = 0;
  for (let i = 0; i < count; i++) {
    arc[i] = length;
    const j = ((i + 1) % count) * 2;
    length += Math.hypot(
      points[j] - points[i * 2],
      points[j + 1] - points[i * 2 + 1],
    );
  }
  return { arc, length };
}

/** `count` points on |x/a|^n + |z/b|^n = 1, evenly spaced by arc length. */
export function superellipse(
  halfWidth: number,
  halfLength: number,
  exponent: number,
  count = 2048,
): Curve {
  const dense = new Float64Array(count * 32 * 2);
  for (let i = 0; i < dense.length / 2; i++) {
    const t = (i / (dense.length / 2)) * Math.PI * 2;
    dense[i * 2] = halfWidth * signedPow(Math.cos(t), 2 / exponent);
    dense[i * 2 + 1] = halfLength * signedPow(Math.sin(t), 2 / exponent);
  }
  const source = { points: dense, ...arcLengths(dense) };
  const points = new Float64Array(count * 2);
  for (let i = 0; i < count; i++) {
    const [x, z] = pointAt(source, (i / count) * source.length);
    points[i * 2] = x;
    points[i * 2 + 1] = z;
  }
  const normals = new Float64Array(count * 2);
  for (let i = 0; i < count; i++) {
    const next = ((i + 1) % count) * 2;
    const previous = ((i - 1 + count) % count) * 2;
    const tx = points[next] - points[previous];
    const tz = points[next + 1] - points[previous + 1];
    const length = Math.hypot(tx, tz);
    normals[i * 2] = tz / length;
    normals[i * 2 + 1] = -tx / length;
  }
  return { points, normals, ...arcLengths(points) };
}

/** The curve moved outward along its normals. Exact for convex curves. */
export function offsetCurve(curve: Curve, distance: number): Curve {
  const points = curve.points.map(
    (value, i) => value + curve.normals[i] * distance,
  );
  return { points, normals: curve.normals, ...arcLengths(points) };
}

function segmentAt(curve: Pick<Curve, "arc" | "length">, s: number) {
  const wrapped = ((s % curve.length) + curve.length) % curve.length;
  let low = 0;
  let high = curve.arc.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (curve.arc[mid] <= wrapped) low = mid;
    else high = mid - 1;
  }
  const end = low + 1 < curve.arc.length ? curve.arc[low + 1] : curve.length;
  return {
    i: low,
    j: (low + 1) % curve.arc.length,
    t: (wrapped - curve.arc[low]) / (end - curve.arc[low]),
  };
}

/** Position at arc length `s` (wraps around). */
export function pointAt(
  curve: Pick<Curve, "points" | "arc" | "length">,
  s: number,
): [number, number] {
  const { i, j, t } = segmentAt(curve, s);
  const p = curve.points;
  return [
    p[i * 2] + (p[j * 2] - p[i * 2]) * t,
    p[i * 2 + 1] + (p[j * 2 + 1] - p[i * 2 + 1]) * t,
  ];
}

/** Outward unit normal at arc length `s`. */
export function normalAt(curve: Curve, s: number): [number, number] {
  const { i, j, t } = segmentAt(curve, s);
  const n = curve.normals;
  const x = n[i * 2] + (n[j * 2] - n[i * 2]) * t;
  const z = n[i * 2 + 1] + (n[j * 2 + 1] - n[i * 2 + 1]) * t;
  const length = Math.hypot(x, z);
  return [x / length, z / length];
}

const polarAngle = (x: number, z: number) =>
  ((Math.atan2(z, x) * 180) / Math.PI + 360) % 360;

/**
 * Arc length where the ray from the origin at `degrees` crosses the curve.
 * The curve must enclose the origin and start at polar angle 0.
 */
export function arcAtAngle(curve: Curve, degrees: number) {
  const target = ((degrees % 360) + 360) % 360;
  const count = curve.arc.length;
  const angle = (i: number) =>
    i === 0
      ? 0
      : i === count
        ? 360
        : polarAngle(curve.points[i * 2], curve.points[i * 2 + 1]);
  let low = 0;
  let high = count;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (angle(mid) <= target) low = mid;
    else high = mid;
  }
  const a0 = angle(low);
  const a1 = angle(high);
  const s0 = curve.arc[low];
  const s1 = high === count ? curve.length : curve.arc[high];
  return s0 + ((target - a0) / (a1 - a0 || 1)) * (s1 - s0);
}
