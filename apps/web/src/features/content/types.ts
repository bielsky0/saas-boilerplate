import type { MDXComponents } from "mdx/types";

/**
 * The shape of a content entry (spec 8.1).
 *
 * Isomorphic and dependency-free on purpose: `src/content/*` registries import
 * this to type themselves, and `source.ts` imports it to read them.
 */

/** What a compiled `.mdx` module exports. */
export interface MDXModule {
  default: (props: { components?: MDXComponents }) => React.JSX.Element;
}

/**
 * One piece of content: its metadata, and a lazy handle on its body.
 *
 * `load` is a thunk rather than a value so that importing a registry costs one
 * object per entry — a listing page that needs titles must not pull in every
 * compiled post body.
 */
export interface ContentEntry<Meta> {
  meta: Meta;
  load: () => Promise<MDXModule>;
}
