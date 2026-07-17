import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";

import { Badge } from "@/components/ui";
import { authorFor } from "@/features/content/authors";
import { JsonLd } from "@/features/content/components/json-ld";
import { mdxElements } from "@/features/content/components/mdx-elements";
import { Prose } from "@/features/content/components/prose";
import { formatContentDate } from "@/features/content/format";
import { blogPostingJsonLd, breadcrumbJsonLd } from "@/features/content/jsonld";
import { pageMetadata } from "@/features/content/seo";
import { CONTENT_LOCALE, getBlogPost, listBlogPosts } from "@/features/content/source";

/**
 * A blog post (spec 8.2, 9.1).
 *
 * Server-rendered: the body is in the HTML, so it is readable with JavaScript
 * disabled and by a crawler that never runs any (verified by
 * e2e/content-no-js.spec.ts).
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

/*
 * This does not prerender today — the root layout reads the session, so every
 * page is dynamic (see ARCHITECTURE.md). It is kept because it costs nothing and
 * is exactly what starts working the day someone enables cacheComponents.
 */
export function generateStaticParams(): { slug: string }[] {
  return listBlogPosts().map((post) => ({ slug: post.slug }));
}

/** Published posts only: an unpublished slug must look like it does not exist. */
function publishedPost(slug: string) {
  const entry = getBlogPost(slug);
  return entry && entry.meta.status === "published" ? entry : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = publishedPost(slug);
  if (!entry) return {};

  const { meta } = entry;
  return pageMetadata({
    title: meta.title,
    description: meta.description,
    path: `/blog/${slug}`,
    locale: await getLocale(),
    // The post's prose is English whatever locale is rendering the chrome, so
    // `/pl/blog/x` declares `/en/blog/x` canonical instead of competing with it.
    contentLocale: CONTENT_LOCALE,
    type: "article",
    image: meta.coverImage ?? `/blog/${slug}/opengraph-image`,
    publishedTime: meta.publishedAt,
    modifiedTime: meta.updatedAt ?? meta.publishedAt,
    authors: [authorFor(meta.author).name],
    tags: meta.tags,
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const entry = publishedPost(slug);
  if (!entry) notFound();

  const { meta } = entry;
  const { default: Body } = await entry.load();
  const author = authorFor(meta.author);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16">
      <JsonLd
        data={[
          blogPostingJsonLd(slug, meta),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: meta.title, path: `/blog/${slug}` },
          ]),
        ]}
      />

      <header className="mb-10 flex flex-col gap-4">
        <Link href="/blog" className="text-muted-foreground hover:text-foreground text-sm">
          ← Back to blog
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {meta.title}
        </h1>
        <p className="text-muted-foreground text-lg text-balance">{meta.description}</p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <time dateTime={meta.publishedAt}>{formatContentDate(meta.publishedAt, locale)}</time>
          <span aria-hidden="true">·</span>
          <span>
            {author.name}
            {author.title ? `, ${author.title}` : ""}
          </span>
          {meta.tags.length > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex flex-wrap gap-2">
                {meta.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="normal-case">
                    {tag}
                  </Badge>
                ))}
              </span>
            </>
          ) : null}
        </div>
      </header>

      <Prose>
        <Body components={mdxElements} />
      </Prose>
    </article>
  );
}
