import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Long-form content wrapper (spec 7.1, 8).
 *
 * The `prose` class comes from @tailwindcss/typography, whose palette is bound
 * to our design tokens once in globals.css. Two rules follow from that binding:
 *
 *   - never add `dark:prose-invert` — the tokens already flip under `.dark`, so
 *     invert would layer the plugin's own dark palette over ours and break it;
 *   - never restyle prose elements ad hoc in a page. Fix the mapping instead.
 *
 * `max-w-none` is offered because the plugin caps at 65ch, which is right for an
 * article and wrong for a docs page that a sidebar already constrains.
 */
export function Prose({
  children,
  className,
  fullWidth = false,
}: {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn("prose prose-sm sm:prose-base", fullWidth && "max-w-none", className)}>
      {children}
    </div>
  );
}
