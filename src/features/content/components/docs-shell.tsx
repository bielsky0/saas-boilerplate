import type { ReactNode } from "react";

import { docsNav } from "../source";
import { DocsNav } from "./docs-nav";
import { DocsSearchForm } from "./docs-search-form";

/**
 * The docs page frame: search + sidebar + content (spec 8.3).
 *
 * A component rather than a `layout.tsx` on purpose. The sidebar needs to know
 * which page is active, and a layout at /docs cannot see the [...slug] param of
 * the page below it — only `usePathname()` could tell it, which would make the
 * whole sidebar a client component for the sake of one highlight. Passing the
 * slug the page already resolved keeps the docs entirely free of client JS.
 */
export function DocsShell({ activeSlug, children }: { activeSlug?: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
        {/*
          Order matters for small screens: search and nav come first in the DOM
          so a keyboard or screen-reader user reaches navigation before prose,
          and `lg:sticky` only pins it once there is a column to pin it in.
        */}
        <aside className="lg:w-60 lg:shrink-0">
          <div className="flex flex-col gap-6 lg:sticky lg:top-24">
            <DocsSearchForm />
            <DocsNav categories={docsNav()} activeSlug={activeSlug} />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
