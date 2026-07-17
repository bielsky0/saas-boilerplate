import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { DocsShell } from "@/features/content/components/docs-shell";
import { JsonLd } from "@/features/content/components/json-ld";
import { mdxElements } from "@/features/content/components/mdx-elements";
import { Prose } from "@/features/content/components/prose";
import { formatContentDate } from "@/features/content/format";
import { breadcrumbJsonLd, techArticleJsonLd } from "@/features/content/jsonld";
import { pageMetadata } from "@/features/content/seo";
import { CONTENT_LOCALE, docsNav, getDoc, listDocs } from "@/features/content/source";

/** A documentation page (spec 8.3, 9.1). */

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export function generateStaticParams(): { slug: string[] }[] {
  return listDocs().map((doc) => ({ slug: doc.slug.split("/") }));
}

function publishedDoc(segments: string[]) {
  const entry = getDoc(segments);
  return entry && entry.meta.status === "published" ? entry : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const entry = publishedDoc(slug);
  if (!entry) return {};

  return pageMetadata({
    title: entry.meta.title,
    description: entry.meta.description,
    path: `/docs/${slug.join("/")}`,
    locale: await getLocale(),
    // English prose under translated chrome — see CONTENT_LOCALE.
    contentLocale: CONTENT_LOCALE,
    type: "article",
    modifiedTime: entry.meta.updatedAt,
  });
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const entry = publishedDoc(slug);
  if (!entry) notFound();

  const path = slug.join("/");
  const { default: Body } = await entry.load();
  const category = docsNav().find((c) => c.docs.some((doc) => doc.slug === path));

  return (
    <DocsShell activeSlug={path}>
      <JsonLd
        data={[
          techArticleJsonLd(path, entry.meta),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Documentation", path: "/docs" },
            ...(category ? [{ name: category.title, path: "/docs" }] : []),
            { name: entry.meta.title, path: `/docs/${path}` },
          ]),
        ]}
      />

      <article className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          {category ? (
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {category.title}
            </div>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight">{entry.meta.title}</h1>
          <p className="text-muted-foreground text-lg text-balance">{entry.meta.description}</p>
        </header>

        {/* fullWidth: the sidebar already constrains the measure, so prose's 65ch cap would double up. */}
        <Prose fullWidth>
          <Body components={mdxElements} />
        </Prose>

        <footer className="border-border text-muted-foreground border-t pt-6 text-sm">
          Last updated{" "}
          <time dateTime={entry.meta.updatedAt}>
            {formatContentDate(entry.meta.updatedAt, locale)}
          </time>
        </footer>
      </article>
    </DocsShell>
  );
}
