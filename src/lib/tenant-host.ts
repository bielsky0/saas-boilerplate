/**
 * Tenant resolution from the `Host` header (langlion §2.27) — pure, edge-safe.
 *
 * This module is deliberately dependency-light for the same reason
 * `src/lib/security/csp.ts` and `src/lib/i18n/config.ts` are: it is imported by
 * `src/proxy.ts`, which runs on every request. It parses a string. It touches no
 * React, no database, no adapter.
 *
 * ─── Why this PARSES a host and does not RESOLVE an organization (D54) ───────
 *
 * `src/proxy.ts` is fast and edge-safe on purpose — its header says so, and the
 * whole optimistic-guard argument rests on it. A database round-trip to turn a
 * label into an organization would pay that cost on EVERY request the matcher
 * touches, including the apex, where no organization exists at all. Next's own
 * documentation says the same thing independently: "Proxy is _not_ intended for
 * slow data fetching."
 *
 * So the split is: this module decides WHAT LABEL was addressed, the proxy
 * publishes it inward as a header, and the request layer decides WHETHER THAT
 * ACADEMY EXISTS via `findOrganizationBySubdomain`. A consequence worth stating
 * out loud, because it looks like a gap until you see it is the design: this
 * module CANNOT tell a real academy from a typo, and must not try. An unknown
 * subdomain is a 404 produced by the request layer (D57), not by the proxy.
 *
 * ─── Why the root domain is a PARAMETER and not read from env here ───────────
 *
 * `vitest.config.ts` forbids unit tests from reaching `@/lib/env/server`, which
 * validates the entire server environment at import time. Reading env in this
 * module would make it untestable without booting a full environment — for a
 * function whose entire job is string manipulation. The proxy already imports
 * env and passes `APP_ROOT_DOMAIN` in.
 */

import { SUBDOMAIN_MAX, SUBDOMAIN_MIN, SUBDOMAIN_PATTERN } from "@/lib/validation/primitives";

/**
 * Request header carrying the resolved tenant label inward to the renderer.
 *
 * Present if and ONLY if the request addressed a tenant host. Absence means the
 * apex — deliberately not encoded as a sentinel value, because "no header" is
 * already unambiguous and a sentinel would be one more convention to agree on.
 *
 * ⚠️ A CLIENT CAN SEND THIS. It is an authority argument for everything
 * downstream, so `forward()` in src/proxy.ts DELETES it unconditionally before
 * setting it. See D56 there.
 */
export const ORG_SUBDOMAIN_HEADER = "x-org-subdomain";

export type HostContext =
  /** Platform surface: marketing, org onboarding, super admin (§2.27). */
  | { kind: "apex" }
  /** An academy was addressed. The label is syntactically valid; it may still not exist. */
  | { kind: "tenant"; subdomain: string }
  /** A host outside APP_ROOT_DOMAIN entirely. Routed as apex, but publishes no tenant. */
  | { kind: "foreign" };

/** Loopback names that are always the apex in dev, whatever APP_ROOT_DOMAIN says. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Normalize a raw `Host` header to a bare, comparable hostname.
 *
 * Three transformations, each earning its place:
 *  - port stripped: `acme.langlion.pl:3000` and `acme.langlion.pl` are one host.
 *  - lowercased: DNS is case-insensitive, our subdomain column is not.
 *  - trailing dot stripped: `acme.langlion.pl.` is a legal fully-qualified name
 *    that some clients send, and it must not read as a different academy.
 *
 * IPv6 literals arrive bracketed (`[::1]:3000`), so the port split must not run
 * on the first colon — hence rfind rather than split.
 */
function normalizeHost(hostHeader: string): string {
  let host = hostHeader.trim().toLowerCase();
  const lastColon = host.lastIndexOf(":");
  const closingBracket = host.lastIndexOf("]");
  // A colon is a port separator only when it follows the address, which for a
  // bracketed IPv6 literal means "after the closing bracket".
  if (lastColon > closingBracket) host = host.slice(0, lastColon);
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

/** Does this label satisfy the same rule `subdomainSchema` enforces at write time? */
function isValidLabel(label: string): boolean {
  return (
    label.length >= SUBDOMAIN_MIN && label.length <= SUBDOMAIN_MAX && SUBDOMAIN_PATTERN.test(label)
  );
}

/**
 * Classify an incoming `Host` header against the platform's root domain.
 *
 * `rootDomain` is `env.APP_ROOT_DOMAIN` in production code — `langlion.pl` in
 * production, `localtest.me` in dev/E2E.
 *
 * The label rule is imported from `src/lib/validation/primitives.ts` rather than
 * restated: a host whose label this function accepts but the signup form would
 * have rejected could never match a row, and one it rejects that the form
 * accepted would be an academy unreachable at its own address. Those two lists
 * must be the same list, so they are the same constant.
 */
export function parseHost(hostHeader: string | null, rootDomain: string): HostContext {
  if (!hostHeader) return { kind: "apex" };

  const host = normalizeHost(hostHeader);
  const root = rootDomain.trim().toLowerCase();

  // Dev convenience, independent of configuration: `localhost:3000` is the apex
  // even when APP_ROOT_DOMAIN names something else entirely.
  if (LOOPBACK_HOSTS.has(host)) return { kind: "apex" };

  if (host === root) return { kind: "apex" };

  if (!host.endsWith(`.${root}`)) return { kind: "foreign" };

  const label = host.slice(0, -(root.length + 1));

  // `www` is in RESERVED_SUBDOMAINS, so it can never BE an academy — mapping it
  // to the apex is therefore free, and closes the most obvious support ticket
  // this scheme would otherwise generate.
  if (label === "www") return { kind: "apex" };

  // Exactly one label. `a.b.langlion.pl` is not a deeper tenant, it is a host we
  // do not serve — treating it as the tenant `a.b` would invent an academy whose
  // name cannot be stored.
  if (label.includes(".")) return { kind: "foreign" };

  if (!isValidLabel(label)) return { kind: "foreign" };

  return { kind: "tenant", subdomain: label };
}
