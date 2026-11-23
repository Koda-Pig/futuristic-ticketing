import { readdirSync, readFileSync } from "node:fs";

/**
 * Netlify `_headers` for the build: only the site itself and the hosts in the
 * venues' `embed.allowedOrigins` (plus `extraOrigins`) may frame the app,
 * hashed assets (Vite's and the venues' content-hashed shells) are cached for
 * good, and the embed test page isn't indexed.
 * Adding an origin to a venue.json takes effect on the next build.
 *
 * @param {string[]} extraOrigins
 */
export function netlifyHeaders(extraOrigins) {
  const venues = readdirSync("public/venues", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      JSON.parse(
        readFileSync(`public/venues/${entry.name}/venue.json`, "utf8"),
      ),
    );
  const ancestors = [
    "'self'",
    ...new Set([
      ...venues.flatMap((venue) => venue.embed.allowedOrigins),
      ...extraOrigins,
    ]),
  ];
  // Only names that carry a content hash (scripts/process-stadium.mjs) are
  // safe to cache for good; a fixed name keeps the host's default.
  const shells = venues
    .map((venue) => venue.shell?.gltfUrl)
    .filter((url) => /\.[0-9a-f]{8,}\.glb(\.gz)?$/.test(url ?? ""));
  return [
    "/*",
    `  Content-Security-Policy: frame-ancestors ${ancestors.join(" ")}`,
    ...["/assets/*", ...shells].flatMap((path) => [
      path,
      "  Cache-Control: public, max-age=31536000, immutable",
    ]),
    "/embed-test.html",
    "  X-Robots-Tag: noindex",
    "",
  ].join("\n");
}
