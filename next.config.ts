import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Validate environment variables at build/startup time (fail-fast).
// Importing the env module runs the Zod schema against process.env, so a
// missing/invalid variable aborts `next dev`/`next build` with a clear error
// instead of failing later at runtime. See src/lib/env/server.ts (spec 19.1).
import "./src/lib/env/server";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the app runs on Vercel *and* as a
  // standalone Node.js server / Docker container (spec 19.1).
  output: "standalone",
  experimental: {
    // Enable `forbidden()` / `unauthorized()` so RBAC failures render real
    // 403/401 responses from server components, actions, and route handlers
    // (spec 4.2). See src/features/organizations/context.ts.
    authInterrupts: true,
  },
};

/*
 * MDX for blog/docs/changelog (spec 8).
 *
 * `pageExtensions` is deliberately NOT set. Content is imported as modules by
 * the registries in src/content/, never routed to directly — a post is data
 * rendered by one page, not a page of its own. Adding .mdx to pageExtensions
 * would make every content file a candidate route and give us two URLs per post.
 *
 * Plugins MUST be named as strings with serializable options: Turbopack (the
 * default bundler in Next 16) passes them to a Rust loader, and a JavaScript
 * function cannot cross that boundary. That constraint is why there is no syntax
 * highlighter here — rehype-pretty-code/@shikijs/rehype earn their keep through
 * function options (`transformers`, `getHighlighter`), which are exactly what
 * cannot be passed. Code blocks are styled with design tokens instead
 * (src/features/content/components/mdx-elements.tsx). Highlighting is not a
 * spec 8/9 requirement; revisit it only with a serializable-options plugin.
 *
 * - remark-gfm:  tables and strikethrough. The docs need tables.
 * - rehype-slug: gives every heading an `id`, which is what lets the h2/h3
 *                overrides render a self-link and lets /docs deep-link.
 */
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug"],
  },
});

/*
 * next-intl (spec 16).
 *
 * The plugin's ONLY job here is to point the runtime at our request config; the
 * path is non-default because `src/lib/i18n/` is where this codebase keeps
 * cross-cutting concerns (see docs/ARCHITECTURE.md), not `src/i18n/`.
 *
 * Note what is NOT wired: `next-intl/middleware`. Locale routing lives in
 * `src/proxy.ts` so that the default-deny auth guard and the locale rules are one
 * decision in one file, rather than two systems negotiating over the same
 * response. See src/lib/i18n/navigation.ts.
 */
const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

export default withNextIntl(withMDX(nextConfig));
