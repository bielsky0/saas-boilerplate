"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Theme provider (spec §7.2). Thin wrapper over next-themes so the rest of the
 * app imports one project component, not the library directly. next-themes writes
 * the chosen theme to `class` on <html> and injects a blocking script before
 * hydration, so a reload paints the correct theme immediately (no flash of wrong
 * theme). Rendered around `children` in the root layout.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
