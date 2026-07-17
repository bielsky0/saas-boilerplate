import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Badge } from "@/components/ui";
import { JsonLd } from "@/features/content/components/json-ld";
import { mdxElements } from "@/features/content/components/mdx-elements";
import { Prose } from "@/features/content/components/prose";
import { formatContentDate } from "@/features/content/format";
import { breadcrumbJsonLd } from "@/features/content/jsonld";
import { pageMetadata } from "@/features/content/seo";
import { getChangelogEntry, listChangelogGroups } from "@/features/content/source";
import { site } from "@/lib/site";

/**
 * Changelog (spec 8.4).
 *
 * Same content mechanism as the blog and docs, different presentation: every
 * release renders inline, grouped by date and newest first, with an anchor per
 * version. One page rather than one page per release — §8.4 asks for a list, and
 * a reader catching up wants to scroll, not to click through fifteen pages.
 */

/**
 * `generateMetadata`, not a static `metadata` object: the canonical, hreflang and
 * og:locale all depend on which language is being served, and a static object
 * cannot see the `[locale]` segment.
 */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Changelog",
    description: `Every notable change to ${site.name}, newest first.`,
    path: "/changelog",
    locale: await getLocale(),
  });
}

export default async function ChangelogPage() {
  const locale = await getLocale();
  const groups = listChangelogGroups();

  // Bodies are loaded up front so the whole page is one server render rather
  // than a waterfall of awaits inside the markup.
  const bodies = new Map(
    await Promise.all(
      groups
        .flatMap((group) => group.entries)
        .map(async (entry) => {
          const loaded = await getChangelogEntry(entry.slug)?.load();
          return [entry.slug, loaded?.default] as const;
        }),
    ),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Changelog", path: "/changelog" },
        ])}
      />

      <header className="mb-12 flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Changelog</h1>
        <p className="text-muted-foreground max-w-xl">Every notable change, newest first.</p>
      </header>

      {groups.length === 0 ? (
        <p className="text-muted-foreground">Nothing released yet.</p>
      ) : (
        <div className="flex flex-col gap-12">
          {groups.map((group) => (
            <section key={group.releasedAt} className="flex flex-col gap-6">
              {group.entries.map((entry) => {
                const Body = bodies.get(entry.slug);
                return (
                  <article key={entry.slug} id={entry.meta.version} className="scroll-mt-24">
                    <header className="mb-4 flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold tracking-tight">
                        {/* The version is the deep-link target for "what changed in 1.2.0". */}
                        <a href={`#${entry.meta.version}`} className="hover:underline">
                          {entry.meta.version}
                        </a>
                      </h2>
                      {entry.meta.kind ? (
                        <Badge
                          variant={entry.meta.kind === "major" ? "default" : "outline"}
                          className="normal-case"
                        >
                          {entry.meta.kind}
                        </Badge>
                      ) : null}
                      <time
                        dateTime={group.releasedAt}
                        className="text-muted-foreground ml-auto text-sm"
                      >
                        {formatContentDate(group.releasedAt, locale)}
                      </time>
                    </header>

                    <p className="text-muted-foreground mb-4">{entry.meta.title}</p>

                    {Body ? (
                      <Prose fullWidth>
                        <Body components={mdxElements} />
                      </Prose>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
