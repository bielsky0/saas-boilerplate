import { authorFor, type AuthorId } from "./authors";
import type { BlogMeta } from "./schema";

import { absoluteUrl, site } from "@/lib/site";

/**
 * JSON-LD structured data builders (spec 9.1).
 *
 * Plain objects; `<JsonLd>` serializes them. Kept apart from the components so
 * the shapes stay testable and so a page reads as "what data", not "how script".
 *
 * Rule: describe only what is actually true on the page. Structured data that
 * disagrees with the rendered content is a manual-action risk, not a ranking
 * trick — which is why the SearchAction below points at /docs?q=, an endpoint
 * that genuinely exists.
 */

/** Loose enough for JSON-LD's open vocabulary, strict enough to serialize. */
export type JsonLdNode = Record<string, unknown>;

export function organizationJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    description: site.description,
    logo: absoluteUrl("/opengraph-image"),
  };
}

export function webSiteJsonLd(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    description: site.description,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absoluteUrl("/docs?q={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function blogPostingJsonLd(slug: string, meta: BlogMeta): JsonLdNode {
  const author = authorFor(meta.author as AuthorId);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: meta.title,
    description: meta.description,
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt ?? meta.publishedAt,
    author: { "@type": "Person", name: author.name, ...(author.url ? { url: author.url } : {}) },
    publisher: { "@type": "Organization", name: site.name, url: site.url },
    image: absoluteUrl(meta.coverImage ?? `/blog/${slug}/opengraph-image`),
    url: absoluteUrl(`/blog/${slug}`),
    // Tells crawlers which URL is canonical for this article.
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(`/blog/${slug}`) },
    ...(meta.tags.length > 0 ? { keywords: meta.tags.join(", ") } : {}),
  };
}

export function techArticleJsonLd(
  slug: string,
  meta: { title: string; description: string; updatedAt: string },
): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: meta.title,
    description: meta.description,
    dateModified: meta.updatedAt,
    publisher: { "@type": "Organization", name: site.name, url: site.url },
    url: absoluteUrl(`/docs/${slug}`),
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(`/docs/${slug}`) },
  };
}

/** `crumbs` are ordered root → current; positions are 1-based per the spec. */
export function breadcrumbJsonLd(crumbs: { name: string; path: string }[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}
