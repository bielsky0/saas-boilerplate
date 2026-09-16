import type { MetadataRoute } from "next";

import { disallowedPages } from "@/lib/public-routes";
import { absoluteUrl } from "@/lib/site";

/**
 * robots.txt (spec 9.1).
 *
 * Like sitemap.ts: a Route Handler, so it is static regardless of the content
 * pages being dynamic.
 *
 * The disallow list is DERIVED from `src/lib/public-routes.ts`, not typed out
 * here — the same declaration that makes /login reachable without a session is
 * what marks it unindexable, so the two cannot drift.
 *
 * Everything the guard already protects (/dashboard, /orgs, /admin, /api) is
 * omitted on purpose. A crawler cannot reach those anyway — they redirect to
 * /login — and enumerating private routes in a world-readable file tells an
 * attacker exactly where to look. robots.txt is a crawling hint, never an access
 * control; the guard is the boundary.
 *
 * Pages listed below ALSO carry `robots: { index: false }` via pageMetadata(),
 * which is what actually keeps them out of an index: Disallow stops crawling,
 * and an uncrawled URL with inbound links still gets listed, just without a
 * description.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: disallowedPages(),
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
