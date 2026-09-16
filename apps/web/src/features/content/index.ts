/**
 * Content / CMS feature module (spec 8 & 9 — blog, docs, changelog, SEO).
 *
 * Blog posts, documentation/help center, and changelog built from a single
 * content mechanism, served under predictable URLs. Owns per-page metadata,
 * Open Graph/Twitter cards, JSON-LD structured data, and sitemap/robots
 * generation for public pages.
 *
 * §8.1's open question — files or database — is settled as FILES: content lives
 * in `src/content/<collection>/<slug>/{meta.ts,content.mdx}` and is listed in
 * that collection's `index.ts` registry. `source.ts` is the only module that
 * knows that; moving to a database is a rewrite of that one file and nothing
 * else.
 *
 * Pages are server-rendered, NOT statically generated, and the distinction is
 * deliberate rather than an oversight: the root layout reads the session for the
 * impersonation banner, which opts every page into dynamic rendering. Next 16
 * removed per-route PPR, so the only remaining door is the app-wide
 * `cacheComponents` flag — a whole-app migration, not a §8 decision. §9.1 permits
 * SSR *or* SSG and the body is in the HTML either way. sitemap.ts, robots.ts and
 * the OG image routes are Route Handlers, outside the layout, so they DO stay
 * static. See ARCHITECTURE.md.
 *
 * This barrel stays isomorphic. `source.ts`, `search.ts`, `jsonld.ts` and the
 * components are imported by full path, as everywhere else in this codebase.
 */

export { AUTHORS, authorFor, type Author, type AuthorId } from "./authors";
export { formatContentDate } from "./format";
export {
  blogMetaSchema,
  changelogMetaSchema,
  defineBlogMeta,
  defineChangelogMeta,
  defineDocMeta,
  docMetaSchema,
  type BlogMeta,
  type ChangelogMeta,
  type DocMeta,
} from "./schema";
export { pageMetadata, type PageMetadataInput } from "./seo";
export type { ContentEntry, MDXModule } from "./types";
