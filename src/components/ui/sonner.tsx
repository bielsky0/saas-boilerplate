"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster, toast } from "sonner";
import type { ComponentProps } from "react";

/**
 * Toast host (spec §7.1). Wraps sonner's `Toaster`, syncing its light/dark
 * appearance to the app theme (next-themes). Mounted once in the root layout;
 * fire toasts anywhere with the re-exported `toast(...)`. Used for transient
 * success feedback on server actions (e.g. "Invitation sent", "Settings saved").
 */
export function Toaster(props: ComponentProps<typeof SonnerToaster>) {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={(resolvedTheme as "light" | "dark" | undefined) ?? "system"}
      position="bottom-right"
      richColors
      closeButton
      {...props}
    />
  );
}

export { toast };
