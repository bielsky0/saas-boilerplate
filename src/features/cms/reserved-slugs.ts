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
 * Which host serves a reserved prefix, IN THE CURRENT PHASE (D60).
 *
 * This exists because F4.5 deliberately did not migrate the staff panel. Without
 * the distinction, `/dashboard` on a tenant host would fall through to the app
 * router, hit default-deny, and redirect to `/login` ON THE TENANT HOST — where
 * the Better Auth cookie is host-scoped and `BETTER_AUTH_URL` points at the
 * apex. The result is a login loop with no message explaining it.
 *
 * F4.6 (panel migration) is then a matter of flipping `dashboard`, `login` and
 * `logout` from "apex" to "tenant" and moving the route folders — not of
 * redesigning the routing.
 */
export type PathStage = "tenant" | "apex";

/**
 * First path segments the app router owns, and where each is served today.
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

  // Served on the platform apex until F4.6 moves the panel.
  dashboard: "apex",
  admin: "apex",
  orgs: "apex",
  settings: "apex",
  login: "apex",
  logout: "apex",
  signup: "apex",
  "verify-email": "apex",
  "forgot-password": "apex",
  "reset-password": "apex",
  invitations: "apex",
  oauth: "apex",
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
