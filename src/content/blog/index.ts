import type { BlogMeta } from "@/features/content/schema";
import type { ContentEntry } from "@/features/content/types";

import designingForNoVendorLockIn from "./designing-for-no-vendor-lock-in/meta";
import helloWorld from "./hello-world/meta";
import scalingPostgres from "./scaling-postgres-for-multi-tenancy/meta";

/**
 * The blog registry (spec 8.1, 8.2).
 *
 * THE KEY IS THE SLUG. `/blog/hello-world` renders `BLOG_ENTRIES["hello-world"]`.
 *
 * Why an explicit registry instead of globbing `src/content/**` with fs:
 * content pages render dynamically (the root layout reads the session — see
 * ARCHITECTURE.md), so an fs read would happen at REQUEST time, and
 * `output: "standalone"` only ships files the bundler traced. `src/content/`
 * would be missing from the container. `outputFileTracingIncludes` can paper
 * over that, but its failure mode is a 500 in production on a page that works in
 * `pnpm dev` and in the E2E suite — which runs `pnpm start`, not the standalone
 * server. Every specifier below is a literal, so the bundler traces the content
 * by construction and there is no config to forget.
 *
 * The cost, stated plainly: publishing is two files plus one line here. The
 * compiler cannot catch a forgotten line (nothing observes an unlisted file), so
 * `e2e/seo-sitemap.spec.ts` does — it reads this directory from disk and fails if
 * a post is not in the sitemap.
 *
 * `meta` is a STATIC import (cheap — a plain object) while the body is a lazy
 * `import()`, so listing pages and the sitemap never compile a post they only
 * need the title of.
 */
export const BLOG_ENTRIES = {
  "hello-world": {
    meta: helloWorld,
    load: () => import("./hello-world/content.mdx"),
  },
  "designing-for-no-vendor-lock-in": {
    meta: designingForNoVendorLockIn,
    load: () => import("./designing-for-no-vendor-lock-in/content.mdx"),
  },
  "scaling-postgres-for-multi-tenancy": {
    meta: scalingPostgres,
    load: () => import("./scaling-postgres-for-multi-tenancy/content.mdx"),
  },
} satisfies Record<string, ContentEntry<BlogMeta>>;

export type BlogSlug = keyof typeof BLOG_ENTRIES;
