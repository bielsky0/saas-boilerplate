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

/**
 * `error` takes the field's slice of `FormState.fieldErrors` (spec 22.2) — an
 * ARRAY, because a value can break several rules at once and a password failing
 * both the length and the digit rule should say both rather than make the user
 * resubmit to discover the second.
 *
 * Passing `undefined` renders nothing, which is what every form that has not
 * been migrated to field-level errors does. Those keep rendering the single
 * whole-form `FormState.error` below the fields, unchanged.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string[];
  /**
   * Standing guidance about the field — a unit, a format, a scope. Rendered
   * BELOW the control with a predictable id, so a caller can point the control's
   * `aria-describedby` at `{htmlFor}-hint` and have screen readers announce it.
   *
   * Distinct from `error`, which is a verdict on what was just entered: a hint is
   * true before anyone types, and stays true afterwards.
   */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={`${htmlFor}-label`} htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error?.length ? (
        <div id={`${htmlFor}-error`}>
          {error.map((message) => (
            <FormMessage key={message}>{message}</FormMessage>
          ))}
        </div>
      ) : null}
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
