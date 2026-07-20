/**
 * Multi-host E2E environment (langlion §2.27, plan F4.5).
 *
 * ─── Why real hosts and not a spoofed Host header ───────────────────────────
 *
 * `*.localtest.me` is a public DNS name whose every label resolves to 127.0.0.1,
 * so `acme.localtest.me:3000` reaches the local server without touching
 * /etc/hosts. That buys the one thing a `Host`-header fixture cannot: the BROWSER
 * sees genuinely different origins, so cookie host-scoping is exercised rather
 * than assumed. §2.19's isolation model rests entirely on that scoping, and a
 * test that fakes the host proves nothing about it.
 *
 * ⚠️ THIS REQUIRES DNS EGRESS. A runner that cannot resolve public names does not
 * fail fast here — every tenant navigation hangs to timeout and reports as an
 * unrelated-looking flake. CI checks `getent hosts probe.localtest.me` before
 * Playwright for exactly that reason.
 *
 * Imported by playwright.config.ts, so this file must stay free of any
 * `@playwright/test` import at module scope — same constraint as
 * rate-limit-fixtures.ts.
 */

/** Root domain the app treats as the platform apex in tests. */
export const E2E_ROOT_DOMAIN = "localtest.me";

const PORT = 3000;

/**
 * Env for the E2E server.
 *
 * `APP_ROOT_DOMAIN` is the one that changes behaviour. The other two follow it so
 * that absolute URLs (verification links, Stripe returns, canonical tags) name a
 * host the suite can actually reach — they are build/runtime-baked to the apex,
 * which stays correct while the staff panel lives there (F4.6 changes that).
 */
export const E2E_HOST_ENV = {
  APP_ROOT_DOMAIN: E2E_ROOT_DOMAIN,
  NEXT_PUBLIC_APP_URL: `http://${E2E_ROOT_DOMAIN}:${PORT}`,
  BETTER_AUTH_URL: `http://${E2E_ROOT_DOMAIN}:${PORT}`,
} as const;

/**
 * The platform apex — `baseURL` for the whole suite.
 *
 * Every existing spec keeps working unchanged because relative paths still
 * resolve here; only tenant traffic needs an absolute URL.
 */
export const APEX_ORIGIN = E2E_HOST_ENV.NEXT_PUBLIC_APP_URL;

/** Origin of one academy's site. */
export function tenantOrigin(subdomain: string): string {
  return `http://${subdomain}.${E2E_ROOT_DOMAIN}:${PORT}`;
}

/** Absolute URL for `path` on one academy's host. */
export function tenantUrl(subdomain: string, path: string): string {
  return `${tenantOrigin(subdomain)}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * A collision-proof subdomain that is a VALID DNS LABEL.
 *
 * ⚠️ DO NOT SEED TENANT SUBDOMAINS WITH `uniqueId()` FROM billing-fixtures. That
 * helper joins with UNDERSCORES, which `SUBDOMAIN_PATTERN` (RFC 1035, see
 * src/lib/validation/primitives.ts) rejects — so `parseHost` classifies such a
 * host as `foreign`, publishes no tenant header, and every request to it answers
 * 404 `unknown_organization`. The failure looks like a broken lookup and is
 * really an invalid name, which is why this helper exists separately rather than
 * as a note somewhere.
 *
 * Hyphens only, lowercase, and comfortably inside the 3–63 character bound.
 */
export function uniqueSubdomain(prefix: string): string {
  const safe = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${safe}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
