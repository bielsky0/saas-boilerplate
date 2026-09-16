import { headers } from "next/headers";

import { NONCE_HEADER } from "./csp";

/**
 * Reads the CSP nonce the proxy minted for this request (spec 22.1).
 *
 * Separate from `./csp.ts` on purpose: that module is imported by `src/proxy.ts`
 * and must stay edge-safe and request-free. `next/headers` is neither. Same
 * split, same reason, as `src/lib/i18n/config.ts` vs the i18n barrel.
 *
 * Returns undefined rather than throwing when the header is absent. That happens
 * on the routes the proxy's matcher skips and in unit contexts, and a missing
 * nonce should degrade one inline tag — not 500 the page. Next applies the nonce
 * to its OWN scripts by parsing the CSP header, so this is only needed for inline
 * tags we write ourselves.
 */
export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get(NONCE_HEADER) ?? undefined;
}
