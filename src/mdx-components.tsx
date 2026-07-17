import type { MDXComponents } from "mdx/types";

import { mdxElements } from "@/features/content/components/mdx-elements";

/**
 * Global MDX component map (spec 8).
 *
 * Required by @next/mdx — the App Router integration does not work without this
 * file, and it must live at the root of `src/`. It is intentionally thin: the
 * actual overrides are in the content feature, next to everything else that
 * renders content.
 *
 * Signature note: `useMDXComponents` takes NO ARGUMENTS in Next 16. The older
 * `(components) => ({ ...components, ...ours })` form is from before 13.1 and is
 * wrong here — see next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * mdx-components.md.
 */
export function useMDXComponents(): MDXComponents {
  return mdxElements;
}
