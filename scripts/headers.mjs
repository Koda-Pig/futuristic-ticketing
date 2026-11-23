import { readdirSync, readFileSync } from "node:fs";

/**
 * Netlify `_headers` for the build: only the site itself and the hosts in the
 * venues' `embed.allowedOrigins` (plus `extraOrigins`) may frame the app,
 * hashed assets are cached for good, and the embed test page isn't indexed.
 * Adding an origin to a venue.json takes effect on the next build.
 *
 * @param {string[]} extraOrigins
 */
export function netlifyHeaders(extraOrigins) {
  const venues = readdirSync("public/venues", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap(
      (entry) =>
        JSON.parse(
          readFileSync(`public/venues/${entry.name}/venue.json`, "utf8"),
        ).embed.allowedOrigins,
    );
  const ancestors = ["'self'", ...new Set([...venues, ...extraOrigins])];
  return [
    "/*",
    `  Content-Security-Policy: frame-ancestors ${ancestors.join(" ")}`,
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "/embed-test.html",
    "  X-Robots-Tag: noindex",
    "",
  ].join("\n");
}
