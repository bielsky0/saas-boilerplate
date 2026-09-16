import { z } from "zod";

import { AUTHOR_IDS } from "./authors";

/**
 * Content metadata schemas (spec 8.1).
 *
 * Every entry under `src/content/` describes itself with a typed `meta` object
 * validated here. Two things follow from validating at MODULE LOAD rather than
 * at request time:
 *   - the registries are imported by the (static) sitemap, so `next build`
 *     evaluates every meta file — a malformed post fails the BUILD, not a page
 *     view. Same fail-fast contract as the env schema (principle #4).
 *   - `defineBlogMeta` gives the author autocomplete while writing, so most
 *     mistakes never reach the validator.
 *
 * There is deliberately NO `slug` field. The registry key IS the slug, and it is
 * also the directory name and the URL. A `slug` field would be a second source
 * of truth that can silently disagree with all three — the bug being that the
 * post renders at one URL and links to itself at another. Do not "fix" this by
 * adding one.
 */

const baseMeta = z.object({
  title: z.string().trim().min(1).max(120),
  /*
   * This IS the <meta name="description"> and the og:description — the cap is
   * not arbitrary tidiness. Search engines truncate around 160 chars; 200 leaves
   * room without letting a paragraph land here by accident.
   */
  description: z.string().trim().min(1).max(200),
  /*
   * Drafts are filtered out of every listing and the sitemap by `source.ts`, and
   * a draft page 404s in production. Status is a literal so the compiler sees it.
   */
  status: z.enum(["draft", "published"]),
});

/** `YYYY-MM-DD`. A date, not a datetime: a publication date has no timezone. */
const contentDate = z.iso.date();

export const blogMetaSchema = baseMeta.extend({
  publishedAt: contentDate,
  updatedAt: contentDate.optional(),
  author: z.enum(AUTHOR_IDS),
  tags: z.array(z.string().trim().min(1)).default([]),
  /** Root-relative path under /public, or an absolute URL. Falls back to the site OG image. */
  coverImage: z.string().trim().min(1).optional(),
  coverImageAlt: z.string().trim().min(1).optional(),
});

export const docMetaSchema = baseMeta.extend({
  /* Required, unlike the blog's: it is the sitemap's `lastModified` for this page. */
  updatedAt: contentDate,
  /** Ordering within a docs category; ties break alphabetically by title. */
  order: z.number().int().default(0),
});

export const changelogMetaSchema = baseMeta.extend({
  /** Display version, e.g. "1.2.0". Free-form: not every product ships semver. */
  version: z.string().trim().min(1),
  releasedAt: contentDate,
  kind: z.enum(["major", "minor", "patch"]).optional(),
});

export type BlogMeta = z.output<typeof blogMetaSchema>;
export type DocMeta = z.output<typeof docMetaSchema>;
export type ChangelogMeta = z.output<typeof changelogMetaSchema>;

/*
 * `define*Meta` validates at module load and returns a typed object. The input
 * type is the schema's INPUT (so `tags` may be omitted and defaulted) while the
 * return is its OUTPUT (so consumers see `tags: string[]`, never undefined).
 */
export function defineBlogMeta(meta: z.input<typeof blogMetaSchema>): BlogMeta {
  return blogMetaSchema.parse(meta);
}

export function defineDocMeta(meta: z.input<typeof docMetaSchema>): DocMeta {
  return docMetaSchema.parse(meta);
}

export function defineChangelogMeta(meta: z.input<typeof changelogMetaSchema>): ChangelogMeta {
  return changelogMetaSchema.parse(meta);
}
