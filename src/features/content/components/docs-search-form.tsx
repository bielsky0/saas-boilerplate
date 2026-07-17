import { Search } from "lucide-react";

import { Input } from "@/components/ui";

/**
 * Docs search input (spec 8.3).
 *
 * A plain GET form, and that is the whole design. It submits to /docs?q=…, which
 * the server renders — so search needs no client component, no server action, no
 * `useActionState`, and no JavaScript at all. It works with JS disabled, it is
 * linkable and shareable, and the browser's own back button behaves.
 *
 * The reflex here is `"use client"` + onChange + fetch. Resist it: that would
 * ship a bundle, break without JS, and buy nothing a form does not already do.
 */
export function DocsSearchForm({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/docs" method="get" role="search" className="relative">
      <label htmlFor="docs-search" className="sr-only">
        Search documentation
      </label>
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        id="docs-search"
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search docs…"
        className="pl-9"
      />
    </form>
  );
}
