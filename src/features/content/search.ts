import { isValidElement, type ReactNode } from "react";

import { getDoc, listDocs } from "./source";

/**
 * Full-text search over the documentation (spec 8.3).
 *
 * HOW THE BODY TEXT IS OBTAINED, because the obvious two ways are both closed:
 *
 *   1. `renderToStaticMarkup` and strip tags — Next REFUSES to build a page whose
 *      module graph reaches `react-dom/server` ("You're importing a component
 *      that imports react-dom/server"). Server Components run under the
 *      react-server condition, where that renderer does not belong. The email
 *      adapter gets away with it only because it is reached from route/job
 *      handlers, never from a page.
 *   2. Read the .mdx off disk — content pages render dynamically, so that is a
 *      REQUEST-time fs read, and `output: "standalone"` would not ship the files.
 *
 * So we do neither. A compiled MDX body is a plain function component, so we CALL
 * it and walk the React elements it returns. No renderer, no DOM, no filesystem —
 * just a tree of objects. `components: {}` keeps the tree to intrinsic tags,
 * which is also why docs must not import client components: an unrendered client
 * or async component would contribute no text (and `<Link>` would need a router
 * that does not exist here).
 *
 * The index is memoized per process: built once per container or serverless cold
 * start, then reused. That is fine for a boilerplate's worth of docs and honestly
 * bounded — when the docs outgrow it, swap this module for Pagefind/Orama/Algolia
 * and leave `searchDocs()`'s signature alone.
 */

export interface DocSearchHit {
  slug: string;
  title: string;
  description: string;
  /** Body text around the first match, for display under the title. */
  snippet: string;
}

interface IndexedDoc {
  slug: string;
  title: string;
  description: string;
  body: string;
}

/** Collect every text node in an element tree, depth-first. */
function collectText(node: ReactNode, out: string[]): void {
  if (node === null || node === undefined || typeof node === "boolean") return;

  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return;
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    collectText(node.props.children, out);
  }
}

let indexPromise: Promise<IndexedDoc[]> | null = null;

async function buildIndex(): Promise<IndexedDoc[]> {
  return Promise.all(
    listDocs().map(async ({ slug, meta }) => {
      const entry = getDoc(slug.split("/"));
      const parts: string[] = [];

      if (entry) {
        const { default: Body } = await entry.load();
        collectText(Body({ components: {} }), parts);
      }

      return {
        slug,
        title: meta.title,
        description: meta.description,
        body: parts.join(" ").replace(/\s+/g, " ").trim(),
      };
    }),
  );
}

function docIndex(): Promise<IndexedDoc[]> {
  indexPromise ??= buildIndex();
  return indexPromise;
}

/** ~140 chars of body centred on the first match, so a hit shows its context. */
function snippetAround(body: string, at: number): string {
  const start = Math.max(0, at - 60);
  const end = Math.min(body.length, at + 80);
  return `${start > 0 ? "…" : ""}${body.slice(start, end).trim()}${end < body.length ? "…" : ""}`;
}

/**
 * Rank: title match beats description beats body — a reader searching "theming"
 * wants the Theming page, not every page that mentions it in passing.
 */
export async function searchDocs(query: string): Promise<DocSearchHit[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const hits: { hit: DocSearchHit; score: number }[] = [];

  for (const doc of await docIndex()) {
    const inTitle = doc.title.toLowerCase().includes(needle);
    const inDescription = doc.description.toLowerCase().includes(needle);
    const bodyAt = doc.body.toLowerCase().indexOf(needle);

    if (!inTitle && !inDescription && bodyAt === -1) continue;

    hits.push({
      score: (inTitle ? 4 : 0) + (inDescription ? 2 : 0) + (bodyAt !== -1 ? 1 : 0),
      hit: {
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        snippet: bodyAt !== -1 ? snippetAround(doc.body, bodyAt) : doc.description,
      },
    });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title))
    .map(({ hit }) => hit);
}
