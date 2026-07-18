import { env } from "@/lib/env/server";

/**
 * Security headers and Content Security Policy (spec 22.1) — pure, edge-safe.
 *
 * This module is deliberately dependency-light for the same reason
 * `src/lib/i18n/config.ts` is: it is imported by `src/proxy.ts`, which runs on
 * every request. It builds strings. It touches no React, no database, no adapter.
 *
 * ─── Why the CSP lives in the proxy and the other four headers do not ────────
 *
 * The CSP carries a per-request nonce, so it can only be built where the request
 * is — the proxy. The other four are constant, and constants belong in
 * `next.config.ts`, because the proxy's matcher skips every path containing a dot
 * (`/robots.txt`, `/sitemap.xml`, `/.well-known/*`, all of `public/`). Splitting
 * them this way is what makes "global" actually global.
 *
 * They must NOT both set the CSP. Two `Content-Security-Policy` response headers
 * are INTERSECTED by the browser, so a nonce-less copy in next.config.ts would
 * veto the nonced one from here and blank the site — a failure that looks like a
 * build problem and is really a header problem.
 *
 * ─── Why a nonce rather than 'unsafe-inline' or hashes ───────────────────────
 *
 * The usual objection to nonces is that they force dynamic rendering. That cost
 * is already paid here: `ImpersonationBanner` reads the session in the root
 * layout, so no page under `[locale]` is statically prerendered (confirmed
 * against .next/prerender-manifest.json). A strict policy is therefore free, and
 * `script-src 'unsafe-inline'` — which would defeat most of the point of having a
 * CSP at all — is not a trade we have to make.
 */

/** Response header name — the ONLY difference between enforce and report-only. */
export const CSP_HEADER =
  env.CSP_MODE === "report-only"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

/** Request header carrying the nonce inward to the renderer. */
export const NONCE_HEADER = "x-nonce";

/**
 * Origin (scheme + host + port, no path) of the object-storage bucket, or null
 * when storage is not configured.
 *
 * This is load-bearing, not defensive. `FileUpload` POSTs the presigned form
 * DIRECTLY to the bucket from the browser, so the bucket is a cross-origin
 * `connect-src`; public file URLs make it an `img-src` too. A hardcoded origin
 * would pass E2E against MinIO on localhost:9000 and then break every real
 * deployment — so it is derived from the same env precedence the S3 adapter uses
 * (`publicBase` in src/lib/adapters/storage/s3.ts): explicit CDN, else endpoint,
 * else the regional AWS host.
 */
function storageOrigin(): string | null {
  if (env.STORAGE_PROVIDER === "none") return null;
  const base = env.S3_PUBLIC_URL ?? env.S3_ENDPOINT ?? `https://s3.${env.S3_REGION}.amazonaws.com`;
  try {
    return new URL(base).origin;
  } catch {
    // A malformed S3 URL must not take down every response with a 500 from the
    // proxy. Storage is already broken at this point; the adapter reports it
    // properly. Omitting the source degrades uploads, not the whole site.
    return null;
  }
}

/**
 * Sources computed ONCE at module load, not per request.
 *
 * Env is fixed for the lifetime of the process, so doing this work on every
 * request would be pure waste on the hottest path in the app.
 */
const STORAGE_ORIGIN = storageOrigin();
const IS_DEV = env.NODE_ENV === "development";

/**
 * Is the app served over https? Gates `upgrade-insecure-requests` — see the
 * comment at that directive for why emitting it on an http origin breaks auth.
 *
 * Reads BETTER_AUTH_URL because it is the server-side statement of the app's
 * public origin, and it is what Better Auth itself uses to build the absolute
 * redirect URLs this directive would rewrite. Keeping the two on the same value
 * is the point: they cannot disagree.
 */
const HTTPS_APP_URL = env.BETTER_AUTH_URL.startsWith("https://");

/** Drop empties so a directive never ends up with a stray double space. */
function sources(...parts: (string | null | undefined | false)[]): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build the policy for one request.
 *
 * `default-src 'self'` is the default-deny base spec 22.1 asks for; every
 * directive below it is a deliberate, narrower exception.
 */
export function buildCsp(nonce: string): string {
  const directives = [
    `default-src 'self'`,
    /*
     * 'strict-dynamic' lets the nonced framework bootstrap load the chunks it
     * needs without us enumerating them, which is the only maintainable way to
     * run a strict policy against a bundler's output. Note it makes browsers
     * that support it IGNORE the host allowlist in THIS directive — documented
     * next to CSP_EXTRA_SCRIPT_SRC in .env.example so nobody debugs that twice.
     *
     * 'unsafe-eval' is development-only: React uses eval to rebuild server error
     * stacks in the browser. Neither React nor Next needs it in production.
     */
    sources(
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      IS_DEV && `'unsafe-eval'`,
      env.CSP_EXTRA_SCRIPT_SRC,
    ),
    /*
     * ⚠️ 'unsafe-inline' HERE IS DELIBERATE, AND STYLE-ONLY. Read before "fixing".
     *
     * A nonce was tried first and does not work, for a specific reason: `sonner`
     * (the toast library, rendered from the root layout) injects its stylesheet
     * with a hardcoded `__insertCSS` helper — `createElement("style")`, append,
     * then set the text — and exposes no nonce option in 2.0.7. Under a nonced
     * style-src the browser blocks it TWICE (once empty on append, once filled),
     * and every toast in the app renders unstyled. Verified in a real browser,
     * not assumed.
     *
     * Rejected alternatives:
     *   - Hashes for those two blocks: they change on any sonner CSS edit, so a
     *     routine patch bump would silently unstyle every toast. A policy that
     *     breaks quietly on upgrade is worse than one that is honestly looser.
     *   - style-src-attr: tested, does not apply — these are <style> ELEMENTS.
     *   - Keeping the nonce alongside 'unsafe-inline': pointless. Per CSP3 a
     *     nonce or hash in a directive makes 'unsafe-inline' IGNORED, so that
     *     combination is exactly today's broken behaviour with extra characters.
     *
     * What this does NOT weaken: `script-src` stays strict and nonced. That is
     * the XSS boundary. Inline STYLE permits CSS-based tricks (selector-driven
     * exfiltration of attribute values, overlay/clickjacking within a page that
     * frame-ancestors already refuses to frame) — real, and far below arbitrary
     * script execution.
     *
     * Revisit when sonner accepts a nonce; this becomes `'nonce-${nonce}'` and
     * nothing else in the file changes.
     */
    sources(`style-src 'self' 'unsafe-inline'`, env.CSP_EXTRA_STYLE_SRC),
    // blob:/data: cover client-side previews of a file the user just picked,
    // before it has been uploaded anywhere.
    sources(`img-src 'self' blob: data:`, STORAGE_ORIGIN, env.CSP_EXTRA_IMG_SRC),
    // Fonts are self-hosted by next/font at build time — no external origin.
    `font-src 'self'`,
    // The bucket is here because the browser uploads to it directly.
    sources(`connect-src 'self'`, STORAGE_ORIGIN, env.CSP_EXTRA_CONNECT_SRC),
    // No <object>/<embed>/<applet>; nothing in this app uses them and they are a
    // classic bypass for script-src.
    `object-src 'none'`,
    // Stop an injected <base href> from re-pointing every relative URL.
    `base-uri 'self'`,
    // Forms may only submit same-origin. Hosted checkout is reached by REDIRECT
    // (spec 5.3), not by cross-origin form POST, so this does not constrain it.
    `form-action 'self'`,
    // Clickjacking: the modern counterpart to X-Frame-Options: DENY.
    `frame-ancestors 'none'`,
    // No frames at all today; state it rather than leaving it to default-src.
    `frame-src 'none'`,
    /*
     * Only when the app is actually SERVED over https — and that condition is
     * not paranoia, it is a bug this cost real time to find.
     *
     * Emitted unconditionally, this directive rewrites every `http://` NAVIGATION
     * to `https://`, including the absolute-URL redirects Better Auth builds from
     * BETTER_AUTH_URL. On a local `http://localhost:3000` there is nothing
     * listening on 443, so sign-in and the password-reset and invitation flows
     * die on "This page couldn't load" — a blank browser error page, with no CSP
     * violation logged anywhere, because the navigation never happens. Two E2E
     * specs caught it; a human would have called it a broken dev server.
     *
     * The signal is the operator's declared public URL rather than the incoming
     * request's protocol, because behind a TLS-terminating proxy (Vercel, nginx)
     * the request reaching Node is plain http even though users are on https —
     * so keying off the request would silently disable this in exactly the
     * deployments that need it.
     */
    HTTPS_APP_URL && `upgrade-insecure-requests`,
  ].filter((d): d is string => Boolean(d));

  return directives.join("; ");
}
