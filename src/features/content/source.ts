import { BLOG_ENTRIES } from "@/content/blog";
import { CHANGELOG_ENTRIES } from "@/content/changelog";
import { DOC_CATEGORIES, DOC_ENTRIES, type DocCategoryId } from "@/content/docs";

import type { BlogMeta, ChangelogMeta, DocMeta } from "./schema";
import type { ContentEntry } from "./types";

/**
 * The content source (spec 8.1).
 *
 * THE ONLY module that knows content is files. Everything else — pages, sitemap,
 * search, SEO — depends on the functions below. §8.1 left "files in the repo vs
 * rows in the database" open and we chose files; this module is the seam that
 * keeps that decision reversible. Moving to a database means rewriting this one
 * file, at which point the signatures become async and callers already await.
 *
 * Two invariants hold for every list* function, and they are the reason drafts
 * cannot leak: they filter `status === "published"` UNCONDITIONALLY, so a draft
 * is not reachable from a listing, the sitemap, or the search index by any
 * caller. `get*` returns drafts, because the PAGE is the one place that needs to
 * tell "unpublished" from "does not exist" — and it answers with notFound().
 */

export interface BlogSummary {
  slug: string;
  meta: BlogMeta;
}

export interface DocSummary {
  slug: string;
  meta: DocMeta;
}

export interface DocCategory {
  id: DocCategoryId;
  title: string;
  docs: DocSummary[];
}

export interface ChangelogSummary {
  slug: string;
  meta: ChangelogMeta;
}

/** Changelog entries sharing a release date, newest first (spec 8.4). */
export interface ChangelogGroup {
  releasedAt: string;
  entries: ChangelogSummary[];
}

function isPublished(entry: { meta: { status: string } }): boolean {
  return entry.meta.status === "published";
}

/** Newest first; ties broken by title so the order is total and stable. */
function byDateDesc<T extends { date: string; title: string }>(a: T, b: T): number {
  return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
}

// ---------------------------------------------------------------- blog

export function listBlogPosts(): BlogSummary[] {
  return Object.entries(BLOG_ENTRIES)
    .filter(([, entry]) => isPublished(entry))
    .map(([slug, entry]) => ({ slug, meta: entry.meta }))
    .sort((a, b) =>
      byDateDesc(
        { date: a.meta.publishedAt, title: a.meta.title },
        { date: b.meta.publishedAt, title: b.meta.title },
      ),
    );
}

export function getBlogPost(slug: string): ContentEntry<BlogMeta> | null {
  return BLOG_ENTRIES[slug as keyof typeof BLOG_ENTRIES] ?? null;
}

/** Every tag in use, for the blog index filter chips. */
export function listBlogTags(): string[] {
  const tags = new Set<string>();
  for (const post of listBlogPosts()) for (const tag of post.meta.tags) tags.add(tag);
  return [...tags].sort();
}

// ---------------------------------------------------------------- docs

export function listDocs(): DocSummary[] {
  return Object.entries(DOC_ENTRIES)
    .filter(([, entry]) => isPublished(entry))
    .map(([slug, entry]) => ({ slug, meta: entry.meta }));
}

export function getDoc(segments: string[]): ContentEntry<DocMeta> | null {
  return DOC_ENTRIES[segments.join("/") as keyof typeof DOC_ENTRIES] ?? null;
}

/**
 * The docs sidebar (spec 8.3 — hierarchical navigation).
 *
 * The hierarchy is derived from the registry key ("guides/theming" → category
 * "guides"), not from a `category` field on each doc. One less thing that can
 * disagree with the URL: a doc cannot claim a category it does not live in.
 * Categories with no published docs are dropped rather than rendered empty.
 */
export function docsNav(): DocCategory[] {
  const docs = listDocs();
  return DOC_CATEGORIES.map((category) => ({
    id: category.id,
    title: category.title,
    docs: docs
      .filter((doc) => doc.slug.startsWith(`${category.id}/`))
      .sort((a, b) => a.meta.order - b.meta.order || a.meta.title.localeCompare(b.meta.title)),
  })).filter((category) => category.docs.length > 0);
}

/** The first doc in sidebar order — where /docs sends a reader with no query. */
export function firstDoc(): DocSummary | null {
  return docsNav()[0]?.docs[0] ?? null;
}

// ---------------------------------------------------------------- changelog

export function listChangelog(): ChangelogSummary[] {
  return Object.entries(CHANGELOG_ENTRIES)
    .filter(([, entry]) => isPublished(entry))
    .map(([slug, entry]) => ({ slug, meta: entry.meta }))
    .sort((a, b) =>
      byDateDesc(
        { date: a.meta.releasedAt, title: a.meta.version },
        { date: b.meta.releasedAt, title: b.meta.version },
      ),
    );
}

export function getChangelogEntry(slug: string): ContentEntry<ChangelogMeta> | null {
  return CHANGELOG_ENTRIES[slug as keyof typeof CHANGELOG_ENTRIES] ?? null;
}

/** Grouped by release date, newest first (spec 8.4). */
export function listChangelogGroups(): ChangelogGroup[] {
  const groups = new Map<string, ChangelogSummary[]>();
  for (const entry of listChangelog()) {
    const bucket = groups.get(entry.meta.releasedAt);
    if (bucket) bucket.push(entry);
    else groups.set(entry.meta.releasedAt, [entry]);
  }
  // listChangelog() is already sorted, and Map preserves insertion order.
  return [...groups].map(([releasedAt, entries]) => ({ releasedAt, entries }));
}

/** Most recent publication across all collections — the sitemap's homepage lastModified. */
export function latestContentDate(): string | undefined {
  const dates = [
    ...listBlogPosts().map((p) => p.meta.updatedAt ?? p.meta.publishedAt),
    ...listDocs().map((d) => d.meta.updatedAt),
    ...listChangelog().map((c) => c.meta.releasedAt),
  ];
  return dates.sort((a, b) => b.localeCompare(a))[0];
}
