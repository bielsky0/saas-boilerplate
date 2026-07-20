import { LOCALES } from "@/lib/i18n/config";

/**
 * Path prefixes an academy's CMS page may not claim (CMS spec §2.1, US-C1.2).
 *
 * ⚠️ THIS IS NOT `RESERVED_SUBDOMAINS`, AND MERGING THE TWO IS A BUG THAT LOOKS
 * LIKE TIDYING (D58). They answer to different authorities:
 *
 *   - `RESERVED_SUBDOMAINS` (src/lib/validation/primitives.ts) holds DNS LABELS
 *     the platform's own infrastructure answers on — `www`, `mail`, `smtp`,
 *     `cdn`. It is read only at write time, by the organization form, and it is
 *     a ONE-WAY RATCHET: once an academy has printed its address on a flyer,
 *     reclaiming the name is not a migration we can perform.
 *   - This list holds FIRST PATH SEGMENTS the Next router already owns. It is
 *     read at RUNTIME, by the proxy, on every request to a tenant host, and it
 *     is free to grow whenever the app gains a top-level route.
 *
 * The two overlap on `api` and `admin`. That is a coincidence, not a relation:
 * `smtp` has no reason to be a forbidden page slug, and `zapisy` has no reason
 * to be a forbidden subdomain. Merged, every future edit to one list would
 * silently restate the rule of the other — and one of them cannot be walked back.
 *
 * ─── Why a collision is a validation error and not a runtime decision ────────
 *
 * A page saved with slug `dashboard` would save cleanly and then be permanently
 * unreachable, because the app router claims that path first. The symptom
 * (page invisible) sits far from the cause (slug choice), which is exactly the
 * kind of failure a write-time check is for. Hence one list, two consumers:
 * `reservedPrefixOf` for the proxy and `isReservedSlug` for slug validation.
 */

/**
 * Which host serves a reserved prefix (D60, widened in F4.6).
 *
 *   - "tenant" — means something only inside an academy. On the apex the proxy
 *     forwards it so the app router answers 404, rather than sending an
 *     anonymous visitor to log in to a page that still would not exist.
 *   - "apex"   — platform surface. On an academy host the proxy hops to the
 *     apex; without that hop `/admin` on a tenant host would fall through to
 *     default-deny and redirect to `/login` ON THAT HOST, where the Better Auth
 *     cookie does not exist — a login loop with no message explaining it.
 *   - "both"   — the same path means different things on the two hosts and is
 *     legitimate on each. Added by F4.6 for the staff panel and the auth surface.
 *
 * ⚠️ "both" IS NOT A CONVENIENCE, IT IS THE SAFE FORM OF WHAT F4.6 ORIGINALLY
 * PLANNED. The earlier note here proposed flipping `dashboard`/`login`/`logout`
 * to "tenant". That is wrong, and the reason is worth stating precisely because
 * the obvious guess overstates it.
 *
 * The apex branch in src/proxy.ts returns `forward()` EARLY for "tenant"-stage
 * prefixes, which SKIPS `isPublicBarePage` and default-deny below it.
 *
 * ⚠️ UPDATED IN F5 — WHAT MAKES THAT SAFE HAS CHANGED. It used to be safe by
 * accident: the only "tenant" prefix was `zapisy`, which had NO ROUTE, so the
 * early return happened to 404. F5 built `/zapisy/[groupTypeSlug]`, so the accident
 * is gone. It is now safe on purpose, and by exactly one thing: that page calls
 * `requireServedOrganization()` as its FIRST statement, which `notFound()`s when
 * no academy is served — the apex, a foreign host, or an unknown subdomain alike.
 *
 * That call is load-bearing, not defensive. Removing it, or moving it below a
 * `params` read or a query, serves one academy's enrollment page on the apex with
 * no tenant resolved. Pinned by e2e/langlion-subdomain-routing.spec.ts.
 *
 * `/dashboard` HAS a route and no such guard at the edge, so the same path would
 * forward an anonymous request into the page — which is why it is "both".
 *
 * MEASURED CONSEQUENCE (mutation-tested, F4.6): the panel is NOT exposed, because
 * every page under it calls `requireSession`/`requireOrgAccess` itself — §4.2's
 * rule that the backend is the boundary is what saves it. What is actually lost
 * is (a) the edge guard as a first line, so any future route added under this
 * prefix without its own check would be served, and (b) locale preservation: the
 * page-level redirect answers `/login?callbackUrl=%2Fdashboard` instead of the
 * proxy's `/en/login?callbackUrl=%2Fen%2Fdashboard`, so a Polish reader is
 * bounced into an English login and returned to an English page.
 *
 * "both" falls through on both hosts and therefore stays behind the guard on
 * both. Pinned by an e2e test that a mutation to "tenant" must break (see
 * e2e/langlion-subdomain-routing.spec.ts).
 */
export type PathStage = "tenant" | "apex" | "both";

/**
 * First path segments the app router owns, and where each is served.
 *
 * The six from CMS spec §2.1 (`dashboard`, `admin`, `api`, `zapisy`, `login`,
 * `logout`) are the required minimum; the rest are the remaining top-level
 * segments under `src/app/[locale]/`, listed because a page slug colliding with
 * any of them fails the same way.
 */
export const RESERVED_PATH_PREFIXES: Readonly<Record<string, PathStage>> = {
  // Served on the academy's own host.
  api: "tenant",
  zapisy: "tenant",

  /*
   * Staff panel and auth surface — the same path on both hosts, different
   * meaning (F4.6). On the apex `/dashboard` is the personal account and its
   * directory of academies; on an academy host it is that academy's panel.
   *
   * The auth pages belong here for a reason that is easy to miss: the login
   * redirect in src/proxy.ts is built with `new URL(…, request.url)`, so it
   * STAYS ON THE HOST THE REQUEST CAME IN ON. Leaving `login` as "apex" would
   * have the tenant branch bounce it back to the apex the moment it was issued.
   */
  dashboard: "both",
  login: "both",
  logout: "both",
  signup: "both",
  "verify-email": "both",
  "forgot-password": "both",
  "reset-password": "both",
  oauth: "both",

  /*
   * Platform surface. `admin` is cross-tenant by definition (§2.27), and `orgs`
   * holds `/orgs/new` — creating an academy cannot happen on that academy's own
   * host, because the tenant does not exist yet. Invitations and unsubscribe are
   * cross-org by nature and their links are built from the apex.
   */
  admin: "apex",
  orgs: "apex",
  /*
   * ACCOUNT settings only (billing, notifications for the personal account).
   * An academy's settings live at `/dashboard/settings/*` and are covered by the
   * `dashboard` entry above — this top-level prefix never means an academy, so
   * marking it "both" would put the personal account's billing page on every
   * academy host for no reason.
   */
  settings: "apex",
  invitations: "apex",
  unsubscribe: "apex",
  blog: "apex",
  changelog: "apex",
  docs: "apex",
};

/**
 * Locale codes are not routes, but they occupy the same first segment (D59).
 *
 * The public URL of a CMS page is `/{locale}/{slug}`, so a page slugged `pl`
 * would sit at `/en/pl` and be indistinguishable from a locale prefix at the
 * position that matters. Derived from `LOCALES` rather than written out, so
 * adding a language cannot leave this behind.
 */
export const RESERVED_LOCALE_PREFIXES: readonly string[] = LOCALES;

/**
 * Paths that never reach the proxy — the matcher's `.*\..*` and `_next/*` rules
 * skip them — but that must still be refused as slugs.
 *
 * This is the ASYMMETRY between the two exports below, and it is deliberate:
 * `reservedPrefixOf` will never be asked about these, while `isReservedSlug`
 * must refuse them, because a page slugged `robots.txt` would be permanently
 * shadowed by a file the framework serves. Do not "make these consistent".
 */
const UNROUTABLE_SLUGS: readonly string[] = [
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  ".well-known",
];

/** First path segment of a locale-stripped path; "" for the root. */
function firstSegment(barePath: string): string {
  return barePath.replace(/^\/+/, "").split("/")[0] ?? "";
}

/**
 * Does this path belong to the app router rather than to the CMS?
 *
 * Matches on the FIRST SEGMENT, not by prefix: `startsWith` would reserve
 * `admin-team` and `zapisy-letnie`, which are ordinary page slugs that happen to
 * begin with a reserved word.
 *
 * Returns `null` for the root path (`/`), which is the academy's home page — a
 * `page` row with an empty slug (CMS spec §4, decision 8), not a special case.
 *
 * @param barePath a LOCALE-STRIPPED path, e.g. `/zapisy/lato` — the caller must
 *   have run `stripLocale` first, or `pl` reads as a page slug.
 */
export function reservedPrefixOf(barePath: string): { prefix: string; stage: PathStage } | null {
  const segment = firstSegment(barePath);
  if (segment === "") return null;
  const stage = RESERVED_PATH_PREFIXES[segment];
  return stage ? { prefix: segment, stage } : null;
}

/**
 * May an academy save a page under this slug? (US-C1.2/AC1–AC3.)
 *
 * The single source the CMS form and its backend validation both call. The empty
 * slug is LEGAL — it is the academy home page — so this returns false for it.
 */
export function isReservedSlug(slug: string): boolean {
  const normalized = slug.trim().toLowerCase().replace(/^\/+/, "");
  if (normalized === "") return false;
  return (
    normalized in RESERVED_PATH_PREFIXES ||
    RESERVED_LOCALE_PREFIXES.includes(normalized) ||
    UNROUTABLE_SLUGS.includes(normalized)
  );
}
