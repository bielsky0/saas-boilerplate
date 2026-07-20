import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ORG_SUBDOMAIN_HEADER } from "@/lib/tenant-host";
import {
  findOrganizationBySubdomain,
  type ServedOrganization,
} from "@/features/client-auth/organization";

/**
 * The academy addressed by the CURRENT request's `Host` (langlion §2.27, F4.5).
 *
 * The request-side half of host resolution. `src/proxy.ts` parses `Host` into a
 * label and publishes it as `x-org-subdomain`; this module turns that label into
 * a row. The split is deliberate — see the "Host resolution" section in the
 * proxy's header for why the lookup cannot live there.
 *
 * Pattern follows `src/lib/i18n/request-locale.ts`: read the header the proxy
 * set, return null rather than a default, let the caller decide what absence
 * means. Absence is legitimate and common — every request to the apex has no
 * tenant at all.
 *
 * ─── Why the header and not the URL ─────────────────────────────────────────
 *
 * There is no slug in the path to read: on a tenant host the tenant IS the host.
 * Reading `Host` again here instead of the header would work but would duplicate
 * `parseHost`'s normalization (port, case, trailing dot, label validity) at a
 * second site — and two copies of that rule disagreeing is an isolation bug, not
 * a formatting one.
 *
 * ⚠️ THE HEADER IS TRUSTED BECAUSE THE PROXY STRIPS IT FIRST. A client can send
 * `x-org-subdomain`; `forward()` deletes it unconditionally before setting its
 * own value (D56). If that delete is ever removed, this module becomes a
 * tenant-selection API for anyone who can set a header.
 */

export type { ServedOrganization };

/** The tenant label the proxy resolved, or null on the apex. */
export async function servedSubdomain(): Promise<string | null> {
  try {
    return (await headers()).get(ORG_SUBDOMAIN_HEADER);
  } catch {
    // No request scope (a job drain, an engine hook). Not an error — the same
    // shape `requestLocale()` uses for the same reason.
    return null;
  }
}

/**
 * The academy being served, or null (apex, foreign host, or unknown subdomain).
 *
 * Returns null for BOTH "no tenant was addressed" and "a tenant was addressed
 * but no such academy exists", because every caller so far answers them
 * identically — with a 404 (D57). Splitting them would mean inventing a
 * distinction the callers do not act on.
 *
 * `cache` deduplicates within one request: a layout, its page and a route
 * handler asking the same question issue one SELECT, not three.
 */
export const servedOrganization = cache(async (): Promise<ServedOrganization | null> => {
  const subdomain = await servedSubdomain();
  if (!subdomain) return null;
  return findOrganizationBySubdomain(subdomain);
});

/**
 * The academy being served, or a 404.
 *
 * 404 rather than a redirect to the apex, deliberately (D57): wildcard DNS means
 * every label answers, so redirecting would turn any `*.langlion.pl` into a
 * link that lands on our marketing site — a free supply of plausible-looking
 * URLs on our domain. It would also show a parent following a flyer link to a
 * closed academy a product pitch instead of an answer.
 */
export async function requireServedOrganization(): Promise<ServedOrganization> {
  const org = await servedOrganization();
  if (!org) notFound();
  return org;
}
