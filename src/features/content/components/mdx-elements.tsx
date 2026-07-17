import type { MDXComponents } from "mdx/types";
import Link from "next/link";

/**
 * HTML element overrides for MDX content (spec 8, 7.1).
 *
 * Most typography comes from the `prose` class (see `<Prose>` and the
 * --tw-prose-* mapping in globals.css); this file covers what a stylesheet
 * cannot do:
 *   - internal links must be <Link> for client-side navigation,
 *   - headings get a self-link built from the `id` that rehype-slug injected,
 *   - code blocks are styled with design tokens, since we ship no highlighter
 *     (see next.config.ts for why).
 *
 * Nothing here may be a client component: these render inside server components
 * AND inside the plain-text pass that builds the docs search index
 * (src/features/content/search.tsx), which cannot render client or async
 * components.
 */

function Anchor({ href = "", children, ...props }: React.ComponentPropsWithoutRef<"a">) {
  const isInternal = href.startsWith("/") || href.startsWith("#");
  if (isInternal) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }
  // External links open in a new tab; `noreferrer` because `noopener` alone
  // still leaks the referrer.
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

/** A heading that is its own anchor, using the id rehype-slug generated. */
function heading(Tag: "h2" | "h3" | "h4") {
  function Heading({ id, children, ...props }: React.ComponentPropsWithoutRef<"h2">) {
    if (!id) {
      return <Tag {...props}>{children}</Tag>;
    }
    return (
      <Tag id={id} className="group scroll-mt-24" {...props}>
        <a href={`#${id}`} className="no-underline">
          {children}
          <span
            aria-hidden="true"
            className="text-muted-foreground ml-2 opacity-0 transition-opacity group-hover:opacity-100"
          >
            #
          </span>
        </a>
      </Tag>
    );
  }
  Heading.displayName = `Mdx${Tag.toUpperCase()}`;
  return Heading;
}

export const mdxElements: MDXComponents = {
  a: Anchor,
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  pre: (props: React.ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="bg-secondary text-secondary-foreground border-border overflow-x-auto rounded-lg border p-4 text-sm"
      {...props}
    />
  ),
  code: (props: React.ComponentPropsWithoutRef<"code">) => (
    <code className="font-mono text-[0.9em]" {...props} />
  ),
};
