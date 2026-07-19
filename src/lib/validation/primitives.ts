import { z } from "zod";

/**
 * Wire-vocabulary schemas (spec 22.2) — the identifiers that travel in URLs,
 * query strings and JSON bodies rather than in form fields.
 *
 * These are plain constants, NOT translator factories, and that is the same
 * deliberate split `features/storage/schema.ts` already makes: a factory exists
 * so a message can be localized, and these messages are never read by a human.
 * A bad `slug` produces a 422 or a 404 for a caller that constructed the request
 * by hand. Paying the factory tax here would buy a Polish translation of a
 * string only a `curl` will ever see.
 *
 * The rule this file exists to enforce: a tenant slug is a POSITIONAL AUTHORITY
 * ARGUMENT. It selects which organization's data the request is about, and it
 * arrives from the client. Before this file, it was validated nowhere — read
 * out-of-band in the storage routes as `typeof body.slug === "string"`, passed
 * straight through from `?slug=` in the notifications route, and taken raw as a
 * `string | null` parameter by every notification action. `typeof x === "string"`
 * accepts `""`, `"../"`, and a megabyte of junk.
 */

/**
 * Lowercase letters, digits, single interior hyphens. 2–48 chars.
 *
 * The ONE definition of the slug rule. `features/organizations/schema.ts` builds
 * its translated, form-facing `slugSchema(t)` on this same constant, so the rule
 * a user is shown while typing and the rule an API request is held to cannot
 * drift apart — the property that file's header already claimed to protect but
 * had no mechanism for.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN = 2;
export const SLUG_MAX = 48;

/** A tenant slug arriving over the wire. */
export const slugParam = z.string().trim().min(SLUG_MIN).max(SLUG_MAX).regex(SLUG_PATTERN);

/**
 * A slug that may be absent, where absent means "the caller's personal account".
 *
 * `.nullish()` rather than `.optional()` on purpose: the storage routes read a
 * missing key as `undefined` from JSON, while the notification actions are
 * called with an explicit `null` from a client component. Both mean the same
 * thing, and normalizing them here keeps every call site from re-deciding.
 */
export const optionalSlugParam = slugParam.nullish();

/**
 * An opaque record id. Length-bounded only — the format belongs to whatever
 * generated it (better-auth ids, nanoid, uuid), so pinning a shape here would
 * break the day one of those changes. The real check is always the owner-scoped
 * query that follows; this only stops junk reaching it.
 */
export const idParam = z.string().trim().min(1).max(255);

/**
 * A DNS label for an academy's public subdomain (langlion §1.2, decyzja D10).
 *
 * Separate from `SLUG_PATTERN` even though the two look alike, because they
 * answer to different authorities. A slug is ours and routes `/orgs/[slug]`; a
 * subdomain is DNS's and becomes `{subdomain}.langlion.com`, so its rule is
 * RFC 1035's: letters, digits and hyphens, never leading or trailing, 63 chars
 * max. Three chars minimum is ours, not DNS's — one- and two-letter subdomains
 * are the ones worth keeping in reserve.
 *
 * Unlike a slug, consecutive hyphens are legal here; `--` is only special at
 * positions 3–4 (punycode), and rejecting it outright would be a rule we would
 * have to explain to anyone who hits it.
 */
export const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const SUBDOMAIN_MIN = 3;
export const SUBDOMAIN_MAX = 63;

/**
 * Labels an academy may not claim, because platform infrastructure answers on
 * them (or will).
 *
 * This list is a one-way ratchet: once an academy has printed
 * `{subdomain}.langlion.com` on a flyer and parents have the link, taking it back
 * is not a migration we can perform. Adding a name here later does not free one
 * already in use, so the list is deliberately broader than what is wired up today.
 */
export const RESERVED_SUBDOMAINS: readonly string[] = [
  "www",
  "app",
  "api",
  "admin",
  "auth",
  "mail",
  "smtp",
  "cdn",
  "static",
  "assets",
  "media",
  "blog",
  "docs",
  "help",
  "support",
  "status",
  "billing",
  "dev",
  "staging",
  "test",
];

/** A subdomain arriving over the wire (e.g. resolved from a Host header). */
export const subdomainParam = z
  .string()
  .trim()
  .toLowerCase()
  .min(SUBDOMAIN_MIN)
  .max(SUBDOMAIN_MAX)
  .regex(SUBDOMAIN_PATTERN);
