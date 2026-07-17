import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/features/content/components/og-image";
import { getBlogPost } from "@/features/content/source";
import { site } from "@/lib/site";

/**
 * Per-post Open Graph card (spec 9.1).
 *
 * Next 16: the props to an image-generating function are PROMISES — `params`
 * must be awaited. In 15 it was a plain object, so this is the one line an
 * upgrade guide silently breaks.
 *
 * Served at /blog/<slug>/opengraph-image?<hash>: the hash is a query, so the
 * pathname has no extension and the route guard must exempt it explicitly
 * (isMetadataImageRoute in lib/public-routes.ts) or every share card 307s to the
 * login page.
 */
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export const alt = `${site.name} blog post`;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getBlogPost(slug);

  // A missing post still needs an image: this route can be requested for any
  // slug, and throwing would make the scraper show a broken card.
  return ogImage({
    eyebrow: "Blog",
    title: entry?.meta.title ?? site.name,
  });
}
