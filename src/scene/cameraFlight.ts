import { CubicBezierCurve3, CurvePath, LineCurve3, Vector3 } from "three";

// Leave the rows toward the pitch before crossing the bowl. A vertical lift
// over an upper-tier seat can hit the underside of Cape Point's roof.
function pitchSide(point: Vector3, scale: number, rise: number) {
  return new Vector3(point.x * scale, point.y + rise, point.z * scale);
}

function leaveRows(start: Vector3, scale: number, turn: Vector3, end: Vector3) {
  const path = new CurvePath<Vector3>();
  const raised = start.clone();
  // Clear the railings immediately in front of the corner seats.
  raised.y += 1.6;
  path.add(new LineCurve3(start, raised));
  path.add(
    new CubicBezierCurve3(
      raised,
      pitchSide(raised, scale, 9 - raised.y * 0.8),
      turn,
      end,
    ),
  );
  return path;
}

export function boxApproach(start: Vector3, entry: Vector3, eye: Vector3) {
  const front = entry.clone().sub(eye).setY(0).normalize();
  return leaveRows(
    start,
    0.48,
    entry.clone().addScaledVector(front, 24),
    entry,
  );
}

export function aerialDive(aerial: Vector3, lower: Vector3) {
  const above = lower.clone();
  above.y = Math.max(76, lower.y + 54);
  const inside = pitchSide(lower, 0.2, 26);
  const path = new CurvePath<Vector3>();
  path.add(
    new CubicBezierCurve3(
      aerial,
      aerial.clone().setY(Math.max(aerial.y, above.y) + 16),
      above.clone().lerp(inside, -0.25),
      above,
    ),
  );
  path.add(
    new CubicBezierCurve3(
      above,
      inside,
      pitchSide(lower, 0.7, -lower.y),
      lower,
    ),
  );
  return path;
}

export function aerialPullback(start: Vector3, aerial: Vector3) {
  return leaveRows(start, 0.18, new Vector3(0, 6, 0), aerial);
}
