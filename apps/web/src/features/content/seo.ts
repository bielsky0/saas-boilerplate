import type { Metadata } from "next";

import { LOCALES, type Locale, OG_LOCALE, withLocale } from "@/lib/i18n/config";
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
  /**
   * Root-relative and BARE — "/blog/hello-world", never "/en/blog/hello-world".
   * The locale prefix is added here, so a caller cannot bake one language into a
   * path that is supposed to exist in all of them.
   */
  path: string;
  /** The request's locale. Drives og:locale, hreflang and the canonical prefix. */
  locale: Locale;
  /**
   * The language the page's BODY is actually written in, when that is fixed
   * regardless of the reader's locale — i.e. every MDX document today (§8).
   *
   * Set it and two things change, both deliberate:
   *   - the canonical points at the body's own language, so `/pl/blog/x` declares
   *     `/en/blog/x` canonical rather than competing with it;
   *   - no hreflang cluster is emitted, because there are no translations to
   *     advertise. Claiming `/pl/blog/x` as the Polish version of English prose
   *     is a lie a crawler will punish.
   *
   * Leave it undefined for chrome pages (landing, auth, listings), which really
   * do exist in every language.
   */
  contentLocale?: Locale;
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
  const { title, description, path, locale, contentLocale, image, type = "website" } = input;
  const { index = true } = input;

  // A translated page is canonical in its own language; a page whose body is
  // fixed-language is canonical in THAT language, whatever locale is rendering it.
  const canonicalPath = withLocale(path, contentLocale ?? locale);
  const url = absoluteUrl(canonicalPath);

  return {
    title: input.titleAbsolute ? { absolute: title } : title,
    description,
    // Resolved against metadataBase from the root layout (spec 9.1).
    alternates: {
      canonical: canonicalPath,
      // Only for pages that genuinely exist per language — see `contentLocale`.
      ...(contentLocale
        ? {}
        : {
            languages: {
              ...Object.fromEntries(LOCALES.map((l) => [l, withLocale(path, l)])),
              // The URL that negotiates, which is precisely what x-default means.
              "x-default": path,
            },
          }),
    },
    ...(index ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      type,
      url,
      title,
      description,
      siteName: site.name,
      locale: OG_LOCALE[contentLocale ?? locale],
      ...(contentLocale
        ? {}
        : { alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]) }),
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
