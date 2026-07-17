import type { DocMeta } from "@/features/content/schema";
import type { ContentEntry } from "@/features/content/types";

import installation from "./getting-started/installation/meta";
import quickstart from "./getting-started/quickstart/meta";
import theming from "./guides/theming/meta";

/**
 * The docs registry (spec 8.3).
 *
 * THE KEY IS THE URL PATH: "getting-started/installation" renders at
 * /docs/getting-started/installation, and its first segment IS its category.
 * That is why a doc has no `category` field — a field could disagree with the
 * URL the reader is looking at.
 *
 * See src/content/blog/index.ts for why this is an explicit registry rather than
 * an fs glob.
 */

/** Sidebar order. A key whose category is not declared here fails at load. */
export const DOC_CATEGORIES = [
  { id: "getting-started", title: "Getting started" },
  { id: "guides", title: "Guides" },
] as const;

export type DocCategoryId = (typeof DOC_CATEGORIES)[number]["id"];

export const DOC_ENTRIES = {
  "getting-started/installation": {
    meta: installation,
    load: () => import("./getting-started/installation/content.mdx"),
  },
  "getting-started/quickstart": {
    meta: quickstart,
    load: () => import("./getting-started/quickstart/content.mdx"),
  },
  "guides/theming": {
    meta: theming,
    load: () => import("./guides/theming/content.mdx"),
  },
} satisfies Record<string, ContentEntry<DocMeta>>;

export type DocSlug = keyof typeof DOC_ENTRIES;

/*
 * Fail-fast (principle #4, applied to content).
 *
 * A doc whose first segment names no declared category would silently vanish
 * from the sidebar — present at its URL, unreachable by navigation, and missing
 * from the nav with no error anywhere. The sitemap imports this module and the
 * sitemap is static, so `next build` runs this check: a typo in a key fails the
 * build instead of quietly hiding a page.
 */
const CATEGORY_IDS = new Set<string>(DOC_CATEGORIES.map((category) => category.id));
for (const slug of Object.keys(DOC_ENTRIES)) {
  const [category = "", ...rest] = slug.split("/");
  if (rest.length === 0) {
    throw new Error(
      `Doc "${slug}" must live in a category (e.g. "getting-started/${slug}") — a bare slug has no place in the sidebar.`,
    );
  }
  if (!CATEGORY_IDS.has(category)) {
    throw new Error(
      `Doc "${slug}" is in category "${category}", which is not declared in DOC_CATEGORIES. Add it there, or fix the key.`,
    );
  }
}
