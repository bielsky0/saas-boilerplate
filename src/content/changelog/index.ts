import type { ChangelogMeta } from "@/features/content/schema";
import type { ContentEntry } from "@/features/content/types";

import v110 from "./v1-1-0/meta";
import v120 from "./v1-2-0/meta";

/**
 * The changelog registry (spec 8.4).
 *
 * Same mechanism as the blog and docs — one content system, three presentations.
 * The key is the slug; entries are grouped by release date at render time by
 * `listChangelogGroups()` in the source layer.
 *
 * The key is deliberately NOT the version string: versions contain dots, and a
 * dot in a URL segment is the one thing the route guard's matcher treats as a
 * static file. "v1-2-0" keeps the URL boring.
 */
export const CHANGELOG_ENTRIES = {
  "v1-2-0": {
    meta: v120,
    load: () => import("./v1-2-0/content.mdx"),
  },
  "v1-1-0": {
    meta: v110,
    load: () => import("./v1-1-0/content.mdx"),
  },
} satisfies Record<string, ContentEntry<ChangelogMeta>>;

export type ChangelogSlug = keyof typeof CHANGELOG_ENTRIES;
