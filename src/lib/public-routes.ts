import type { MetadataRoute } from "next";

import { stripLocale } from "@/lib/i18n/config";

/**
 * The public page surface (spec §2.5, §9.1).
 *
 * ONE declaration with THREE consumers, because they were drifting apart the
 * moment there was more than one:
 *   - src/proxy.ts     — which pages are reachable without a session
 *   - src/app/sitemap.ts — which pages search engines should index
 *   - src/app/robots.ts  — which pages they should be told to skip
 *
 * `indexable` is required, not optional. "Reachable without a session" and
 * "should be in Google" are different questions that look like one question:
 * /login is the first, not the second. Making the field mandatory means adding a
 * public route without answering the SEO question is a type error rather than a
 * page that quietly ends up in search results.
 *
 * Only PAGES live here. The `/api/*` exemptions stay in proxy.ts: they are not
 * pages, they are never sitemap candidates, and their rationale is about
 * webhook signatures and cron bearer tokens, which has nothing to do with SEO.
 */

/** Sitemap hints for a page we want indexed; `false` = reachable but not indexed. */
type Indexable =
  | false
  | {
      changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
      priority: number;
    };

interface PublicPageRoute {
  /**
   * Whether nested paths under this route are public too (`/blog` → `/blog/x`).
   *
   * NEVER set this on "/" — `"/".startsWith` logic would match every path in the
   * app and turn the default-deny guard into open access. It is `false` there,
   * and it must stay `false`.
   */
  prefix: boolean;
  indexable: Indexable;
}

export const PUBLIC_PAGE_ROUTES = {
  "/": { prefix: false, indexable: { changeFrequency: "weekly", priority: 1 } },

  // Content (spec §8). Prefix-matched so posts, nested doc pages and Next's
  // generated per-post metadata routes are all covered by one entry.
  "/blog": { prefix: true, indexable: { changeFrequency: "daily", priority: 0.8 } },
  "/docs": { prefix: true, indexable: { changeFrequency: "weekly", priority: 0.8 } },
  "/changelog": { prefix: true, indexable: { changeFrequency: "weekly", priority: 0.5 } },

  /*
   * Auth pages. Public by necessity, unindexed by intent.
   *
   * The password-reset pair and the unsubscribe page are used BY DEFINITION
   * without a session — a user resetting a password cannot log in, and an
   * unsubscribe link is clicked from an inbox on a device that may never have
   * logged in. Guarding them would 307 to /login and make each flow dead on
   * arrival.
   *
   * `indexable: false` also earns them a `robots: { index: false }` meta tag via
   * pageMetadata(). The robots.txt Disallow below is not sufficient on its own:
   * it stops crawling, not indexing — a disallowed URL with inbound links still
   * gets listed, just without a description.
   */
  "/login": { prefix: false, indexable: false },
  "/signup": { prefix: false, indexable: false },
  "/verify-email": { prefix: false, indexable: false },
  "/forgot-password": { prefix: false, indexable: false },
  "/reset-password": { prefix: false, indexable: false },
  "/unsubscribe": { prefix: false, indexable: false },
} satisfies Record<string, PublicPageRoute>;

export type PublicPagePath = keyof typeof PUBLIC_PAGE_ROUTES;

const ROUTE_ENTRIES = Object.entries(PUBLIC_PAGE_ROUTES) as [PublicPagePath, PublicPageRoute][];

/**
 * True when `pathname` is a public PAGE (api exemptions live in proxy.ts).
 *
 * NORMALIZES the locale prefix rather than multiplying the table above (§16).
 * `/pl/blog` and `/blog` are the same page in two languages, not two entries —
 * a per-locale table would double every time a locale is added, and the failure
 * mode of forgetting a row is a public page that 307s to /login in Polish only.
 *
 * `stripLocale` is idempotent, so the bare paths `sitemap.ts` and `robots.ts`
 * pass in are unaffected, and doing it HERE rather than at each call site makes
 * the function total: no future consumer can forget to strip first.
 */
export function isPublicPage(pathname: string): boolean {
  const bare = stripLocale(pathname);
  for (const [path, route] of ROUTE_ENTRIES) {
    if (bare === path) return true;
    if (route.prefix && bare.startsWith(`${path}/`)) return true;
  }
  return false;
}

/**
 * Next's generated metadata image routes (opengraph-image, twitter-image, …).
 *
 * These MUST be public, and the reason they are not already is a trap worth
 * spelling out. For a code-generated image Next serves it at a pathname with NO
 * extension and puts the content hash in the QUERY:
 *
 *   /blog/hello/opengraph-image?a1b2c3
 *
 * (see `hashQuery` in next/dist/esm/build/webpack/loaders/next-metadata-image-loader.js).
 * The proxy matcher excludes `.*\..*`, which tests the pathname — and there is no
 * dot in the pathname, so these routes DO run through the guard. A route group
 * additionally appends a short hash to the segment (`opengraph-image-a1b2c3`,
 * see get-metadata-route.js), which is why this matches a suffix too.
 *
 * An OG image is by definition fetched by an anonymous scraper that carries no
 * session and does not follow redirects, so guarding one means every share card
 * on every social network renders as a login page.
 */
const METADATA_IMAGE_ROUTE =
  /(^|\/)(opengraph-image|twitter-image|icon|apple-icon)(-[0-9a-z]{6})?$/;

export function isMetadataImageRoute(pathname: string): boolean {
  return METADATA_IMAGE_ROUTE.test(pathname);
}

/** Indexable pages, for sitemap.ts. */
export function indexablePages(): { path: PublicPagePath; indexable: Exclude<Indexable, false> }[] {
  return ROUTE_ENTRIES.filter(
    (
      entry,
    ): entry is [PublicPagePath, PublicPageRoute & { indexable: Exclude<Indexable, false> }] =>
      entry[1].indexable !== false,
  ).map(([path, route]) => ({ path, indexable: route.indexable }));
}

/** Public-but-unindexed pages, for robots.ts `disallow`. */
export function disallowedPages(): PublicPagePath[] {
  return ROUTE_ENTRIES.filter(([, route]) => route.indexable === false).map(([path]) => path);
}
