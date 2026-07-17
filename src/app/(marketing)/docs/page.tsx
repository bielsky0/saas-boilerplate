import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { DocsShell } from "@/features/content/components/docs-shell";
import { JsonLd } from "@/features/content/components/json-ld";
import { breadcrumbJsonLd } from "@/features/content/jsonld";
import { searchDocs } from "@/features/content/search";
import { pageMetadata } from "@/features/content/seo";
import { docsNav } from "@/features/content/source";
import { site } from "@/lib/site";

/**
 * Docs index AND search results (spec 8.3).
 *
 * One route serves both because search is a GET form pointing here: /docs lists
 * the sections, /docs?q=tokens lists matches. Rendered on the server, so results
 * work with JavaScript disabled and every search is a shareable URL.
 */

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export const metadata: Metadata = pageMetadata({
  title: "Documentation",
  description: `Guides and reference for building on ${site.name} — installation, first steps, and theming.`,
  path: "/docs",
});

export default async function DocsIndexPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchDocs(query) : [];

  return (
    <DocsShell>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Documentation", path: "/docs" },
        ])}
      />

      {query ? (
        <section aria-labelledby="results-heading" className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 id="results-heading" className="text-2xl font-semibold tracking-tight">
              {results.length} {results.length === 1 ? "result" : "results"} for “{query}”
            </h1>
            <Link href="/docs" className="text-muted-foreground hover:text-foreground text-sm">
              Clear search
            </Link>
          </header>

          {results.length === 0 ? (
            <p className="text-muted-foreground">
              Nothing matched. Try a different word, or browse the sections in the sidebar.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {results.map((hit) => (
                <li key={hit.slug}>
                  <Card className="relative transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="text-lg">
                        <Link
                          href={`/docs/${hit.slug}`}
                          className="after:absolute after:inset-0 after:content-['']"
                        >
                          {hit.title}
                        </Link>
                      </CardTitle>
                      <p className="text-muted-foreground text-sm">{hit.snippet}</p>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>
            <p className="text-muted-foreground max-w-xl">
              Everything you need to run the boilerplate, understand its conventions, and make it
              your own.
            </p>
          </header>

          {docsNav().map((category) => (
            <section
              key={category.id}
              aria-labelledby={`cat-${category.id}`}
              className="flex flex-col gap-3"
            >
              <h2 id={`cat-${category.id}`} className="text-lg font-medium">
                {category.title}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {category.docs.map((doc) => (
                  <Card key={doc.slug} className="relative transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="text-base">
                        <Link
                          href={`/docs/${doc.slug}`}
                          className="after:absolute after:inset-0 after:content-['']"
                        >
                          {doc.meta.title}
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-sm">{doc.meta.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </DocsShell>
  );
}
