import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { JsonLd } from "@/features/content/components/json-ld";
import { PostCard } from "@/features/content/components/post-card";
import { breadcrumbJsonLd } from "@/features/content/jsonld";
import { pageMetadata } from "@/features/content/seo";
import { listBlogPosts } from "@/features/content/source";
import { absoluteUrl, site } from "@/lib/site";

/**
 * Blog index (spec 8.2).
 *
 * Only published posts appear, and that is guaranteed at the source rather than
 * here — `listBlogPosts()` cannot return a draft.
 */

/**
 * `generateMetadata`, not a static `metadata` object: the canonical, hreflang and
 * og:locale all depend on which language is being served, and a static object
 * cannot see the `[locale]` segment.
 */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Blog",
    description: `Product updates, engineering notes and architecture decisions from the ${site.name} team.`,
    path: "/blog",
    locale: await getLocale(),
  });
}

export default function BlogIndexPage() {
  const posts = listBlogPosts();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: `${site.name} Blog`,
            url: absoluteUrl("/blog"),
            blogPost: posts.map((post) => ({
              "@type": "BlogPosting",
              headline: post.meta.title,
              url: absoluteUrl(`/blog/${post.slug}`),
              datePublished: post.meta.publishedAt,
            })),
          },
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
          ]),
        ]}
      />

      <header className="mb-10 flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Blog</h1>
        <p className="text-muted-foreground max-w-xl">
          Product updates, engineering notes, and the reasoning behind the architecture.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">No posts published yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
