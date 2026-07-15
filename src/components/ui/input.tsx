import type { InputHTMLAttributes } from "react";

/**
 * Token-driven text input primitive (spec 7.1). Presentational only.
 */
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={
        "w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:border-white/20 " +
        className
      }
      {...props}
    />
  );
}
