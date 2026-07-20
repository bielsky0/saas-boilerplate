import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Token-driven multiline text primitive (spec §7.1). Presentational only.
 *
 * Mirrors `Input`'s classes apart from the fixed height: a textarea's size is
 * content-driven, so it takes `min-h` and lets the `rows` attribute (or a
 * caller's class) decide the rest.
 */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
