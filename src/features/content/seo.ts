import type { Metadata } from "next";

import { absoluteUrl, site } from "@/lib/site";

/**
 * Per-page metadata (spec 9.1).
 *
 * THE ONE DOOR. Every public page builds its metadata here, and the reason is a
 * trap that a naive `export const metadata = { title, description }` walks
 * straight into:
 *
 *   Metadata segments REPLACE `openGraph`, they do not merge it. Next only fills
 *   a page's title into openGraph when the page declares an openGraph object of
 *   its own — `inheritFromMetadata` in next/dist/esm/lib/metadata/resolve-metadata.js
 *   is guarded by `if (target)`. So a page that sets only title/description
 *   inherits the ROOT layout's openGraph wholesale, and every share card for
 *   every post reads "SaaS Boilerplate". The <title> is correct, the page looks
 *   fine, and only the card is wrong — which is why e2e/seo-metadata.spec.ts
 *   asserts og:title per page and not just <title>.
 *
 * So this always emits a COMPLETE openGraph + twitter block. Never hand-write
 * metadata on a page reachable without a session.
 */

export interface PageMetadataInput {
  title: string;
  description: string;
  /** Root-relative, e.g. "/blog/hello-world". Becomes the canonical URL. */
  path: string;
  /** Root-relative or absolute; defaults to the route's generated OG image. */
  image?: string;
  type?: "website" | "article";
  /** Article facets (ignored for type: "website"). ISO dates. */
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  tags?: string[];
  /**
   * Whether search engines may index this page. Defaults to true.
   *
   * `false` emits `robots: { index: false, follow: false }`, which is what
   * actually keeps a page out of an index — a robots.txt Disallow only stops
   * crawling, and a disallowed URL with inbound links still gets listed.
   */
  index?: boolean;
  /**
   * Opt out of the root layout's `%s · <site>` title template.
   *
   * For the home page, whose title already ends in the site name — without this
   * the template appends it a second time ("… · SaaS Boilerplate · SaaS
   * Boilerplate"). Note the og:title never gets the template applied, so it is
   * the plain string either way.
   */
  titleAbsolute?: boolean;
}

export function pageMetadata(input: PageMetadataInput): Metadata {
  const { title, description, path, image, type = "website", index = true } = input;
  const url = absoluteUrl(path);

  return {
    title: input.titleAbsolute ? { absolute: title } : title,
    description,
    // Resolved against metadataBase from the root layout (spec 9.1).
    alternates: { canonical: path },
    ...(index ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      type,
      url,
      title,
      description,
      siteName: site.name,
      locale: site.locale,
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
      ...(type === "article"
        ? {
            publishedTime: input.publishedTime,
            modifiedTime: input.modifiedTime,
            authors: input.authors,
            tags: input.tags,
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
      ...(site.twitterHandle ? { site: site.twitterHandle } : {}),
    },
  };
}
