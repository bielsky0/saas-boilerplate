import type { MetadataRoute } from "next";

import { latestContentDate, listBlogPosts, listDocs } from "@/features/content/source";
import { DEFAULT_LOCALE, LOCALES, withLocale } from "@/lib/i18n/config";
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
 *
 * ─── Locales (spec 16.1) ────────────────────────────────────────────────────
 *
 * CHROME pages exist in every language, so each is listed once per locale and
 * cross-linked with hreflang. CONTENT pages do not: a post's body is English
 * (see `contentLocale` in features/content/source.ts), and only its surrounding
 * chrome translates. Listing `/pl/blog/x` as a Polish ALTERNATE of `/en/blog/x`
 * would be a lie told to a crawler — the two URLs serve identical prose, and
 * hreflang between them invites Google to pick one arbitrarily and report a
 * "duplicate without user-selected canonical". So content is listed only under
 * its own language, and `/pl/blog/x` (which still renders) points its canonical
 * at `/en/blog/x` — see features/content/seo.ts.
 *
 * The day per-locale MDX lands, `contentLocale` starts varying and this function
 * follows with no further change.
 */

/**
 * hreflang cluster for a page that genuinely exists in every language.
 *
 * `x-default` points at the UNPREFIXED path, which is exactly what it means: the
 * URL that negotiates. That is the one thing `/` still does after §16 — it 307s
 * to the reader's language.
 */
function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = absoluteUrl(withLocale(path, locale));
  }
  languages["x-default"] = absoluteUrl(path);
  return languages;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = indexablePages().flatMap(({ path, indexable }) =>
    LOCALES.map((locale) => ({
      url: absoluteUrl(withLocale(path, locale)),
      // The homepage advertises the freshest thing on the site; a landing page
      // whose lastmod never moves is a landing page crawlers stop revisiting.
      lastModified: path === "/" ? latestContentDate() : undefined,
      changeFrequency: indexable.changeFrequency,
      priority: indexable.priority,
      alternates: { languages: languageAlternates(path) },
    })),
  );

  const posts: MetadataRoute.Sitemap = listBlogPosts().map((post) => ({
    url: absoluteUrl(withLocale(`/blog/${post.slug}`, DEFAULT_LOCALE)),
    lastModified: post.meta.updatedAt ?? post.meta.publishedAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const docs: MetadataRoute.Sitemap = listDocs().map((doc) => ({
    url: absoluteUrl(withLocale(`/docs/${doc.slug}`, DEFAULT_LOCALE)),
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
