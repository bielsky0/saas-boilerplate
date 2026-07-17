import type { MetadataRoute } from "next";

import { latestContentDate, listBlogPosts, listDocs } from "@/features/content/source";
import { indexablePages } from "@/lib/public-routes";
import { absoluteUrl } from "@/lib/site";

/**
 * sitemap.xml (spec 8.2, 9.1).
 *
 * STATIC, and deliberately so. This is a Route Handler, not a page, so it is not
 * wrapped by the root layout and does not inherit its session read — it is
 * generated at build time and costs nothing per request even though the content
 * PAGES it lists are dynamic. If a build ever reports this route as `ƒ` rather
 * than `○`, something introduced a request-time API here; find it rather than
 * accept it.
 *
 * "Updates automatically on publication" holds because content lives in the repo:
 * publishing is a commit, a commit is a deploy, and a deploy rebuilds this file.
 *
 * Drafts cannot appear here. Not because of a filter below, but because
 * `listBlogPosts()`/`listDocs()`/`listChangelog()` filter unconditionally at the
 * source — there is no way to ask them for a draft.
 *
 * Static pages come from `src/lib/public-routes.ts`, which is also what the route
 * guard reads. That is what stops a new public page from being reachable but
 * unlisted (or listed but unreachable) — the two facts have one source.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = indexablePages().map(({ path, indexable }) => ({
    url: absoluteUrl(path),
    // The homepage advertises the freshest thing on the site; a landing page
    // whose lastmod never moves is a landing page crawlers stop revisiting.
    lastModified: path === "/" ? latestContentDate() : undefined,
    changeFrequency: indexable.changeFrequency,
    priority: indexable.priority,
  }));

  const posts: MetadataRoute.Sitemap = listBlogPosts().map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: post.meta.updatedAt ?? post.meta.publishedAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const docs: MetadataRoute.Sitemap = listDocs().map((doc) => ({
    url: absoluteUrl(`/docs/${doc.slug}`),
    lastModified: doc.meta.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  /*
   * The changelog is deliberately absent here beyond its index. §8.4 asks for a
   * LIST grouped by version/date, so every release renders on /changelog itself
   * with an anchor per version — there are no per-entry URLs to list, and adding
   * them would put 404s in the sitemap.
   */
  return [...staticPages, ...posts, ...docs];
}
