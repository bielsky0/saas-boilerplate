import { Root as LabelRoot } from "@radix-ui/react-label";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Label + field + message primitives (spec §7.1). Presentational only.
 *
 * `FormField` keeps the label→control association (native `htmlFor` for inputs;
 * the label also carries an `id` so non-native controls like `Select` can point
 * at it with `aria-labelledby`). `FormMessage` absorbs the repeated inline
 * error/success text (`text-red-600` / `text-green-700`) into one tokenized
 * component with the right ARIA live role.
 */
export function Label({ className, ...props }: ComponentProps<typeof LabelRoot>) {
  return (
    <LabelRoot
      className={cn(
        "text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

export function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={`${htmlFor}-label`} htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
    </div>
  );
}

export function FormMessage({
  variant = "error",
  className,
  children,
}: {
  variant?: "error" | "success";
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "text-sm",
        variant === "error" ? "text-destructive" : "text-success",
        className,
      )}
    >
      {children}
    </p>
  );
}
