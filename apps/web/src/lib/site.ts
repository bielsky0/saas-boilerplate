import { clientEnv } from "@/lib/env/client";

/**
 * Site identity (spec §9.1 — canonical URLs, Open Graph, structured data).
 *
 * One source of truth for the things that must agree across the <title>
 * template, og:site_name, the JSON-LD Organization node, the sitemap's base URL
 * and the email footer. These were previously five hardcoded copies of the
 * string "SaaS Boilerplate"; a rename is now a change here.
 *
 * `url` comes from the validated client env, NOT process.env (principle #4).
 * Consequence worth knowing before you deploy: NEXT_PUBLIC_* is inlined at BUILD
 * time and the sitemap is statically generated, so every canonical URL is frozen
 * when the image is built. One image cannot serve two domains — pass
 * NEXT_PUBLIC_APP_URL as a Docker `--build-arg`, not a runtime env var.
 *
 * Deliberately NOT the home of `EMAIL_FROM` (src/lib/env/server.ts): that value
 * must carry a domain the mail provider has verified, which makes it deployment
 * config that happens to contain the brand name rather than branding. Wiring it
 * here would also drag the client env schema into next.config.ts's module graph,
 * which imports env/server at startup.
 */
export const site = {
  name: "SaaS Boilerplate",
  description:
    "Authentication, multi-tenancy, RBAC, billing, and a themed design system — production-ready and free of vendor lock-in.",
  url: clientEnv.NEXT_PUBLIC_APP_URL,
  /** OG locale format (underscore), not the BCP-47 tag used by <html lang>. */
  locale: "en_US",
  /** Twitter/X handle used for `twitter:site`. Empty string = omit the tag. */
  twitterHandle: "",
} as const;

/** Absolute URL for a root-relative path — required by OG tags and the sitemap. */
export function absoluteUrl(path: string): string {
  return new URL(path, site.url).toString();
}
