import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Alert primitive (spec §7.1). Inline callout for status/warnings (e.g. the
 * unverified-email banner, the settings danger zone). Presentational only —
 * callers set `role`/`aria-live` as appropriate.
 */
export const alertVariants = cva("rounded-md border px-4 py-3 text-sm", {
  variants: {
    variant: {
      info: "border-border bg-muted text-foreground",
      warning: "border-warning/40 bg-warning/10 text-warning",
      success: "border-success/40 bg-success/10 text-success",
      destructive: "border-destructive/40 bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: {
    variant: "info",
  },
});

type AlertProps = ComponentProps<"div"> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<"h5">) {
  return <h5 className={cn("mb-1 font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("text-sm opacity-90", className)} {...props} />;
}
