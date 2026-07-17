import Link from "next/link";

import { cn } from "@/lib/utils";
import type { DocCategory } from "../source";

/**
 * The docs sidebar (spec 8.3 — hierarchical navigation).
 *
 * A server component: the active item is derived from the slug the page already
 * resolved, not from `usePathname()`. That keeps the whole docs surface free of
 * client JavaScript, which is also why it still highlights correctly with JS off.
 */
export function DocsNav({
  categories,
  activeSlug,
}: {
  categories: DocCategory[];
  activeSlug?: string;
}) {
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6 text-sm">
      {categories.map((category) => (
        <div key={category.id} className="flex flex-col gap-2">
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {category.title}
          </div>
          <ul className="border-border flex flex-col gap-1 border-l">
            {category.docs.map((doc) => {
              const isActive = doc.slug === activeSlug;
              return (
                <li key={doc.slug}>
                  <Link
                    href={`/docs/${doc.slug}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "-ml-px block border-l py-1 pl-3 transition-colors",
                      isActive
                        ? "border-foreground text-foreground font-medium"
                        : "text-muted-foreground hover:border-foreground/40 hover:text-foreground border-transparent",
                    )}
                  >
                    {doc.meta.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
