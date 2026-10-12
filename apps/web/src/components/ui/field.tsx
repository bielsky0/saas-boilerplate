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
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
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
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={`${htmlFor}-label`} htmlFor={htmlFor}>
        {label}
      </Label>
      {children}
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

/**
 * AdminCN layout field primitives (etap 5, faza 5.1) — plain styled wrappers
 * ported from the template's `field.tsx` WITHOUT its Base-UI machinery.
 *
 * Why not the whole template file: it is built on `useRender` and expects a
 * Base-UI `Label`, while this module's contract (`FormField`/`FormMessage`)
 * stays Radix-based per the faza-6 decision. These additions are
 * deliberately dumb divs/fieldset/legend/label so the demo form layouts keep
 * the template's look with zero behavior coupling. `FieldError` accepts RHF
 * field errors (`{ message }` items), like the template's.
 */
export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-7",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  className,
  orientation = "vertical",
  ...props
}: ComponentProps<"div"> & { orientation?: "vertical" | "horizontal" }) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(
        "group/field flex w-full gap-3",
        orientation === "horizontal" && "flex-row items-center",
        orientation === "vertical" && "flex-col",
        className,
      )}
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: ComponentProps<typeof LabelRoot>) {
  return (
    <Label
      data-slot="field-label"
      className={cn("group/field-label flex w-fit gap-2 leading-snug", className)}
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "text-muted-foreground text-left text-sm font-normal leading-normal",
        className,
      )}
      {...props}
    />
  );
}

export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return (
    <fieldset data-slot="field-set" className={cn("flex flex-col gap-6", className)} {...props} />
  );
}

export function FieldLegend({
  className,
  variant = "legend",
  ...props
}: ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "mb-3 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base",
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({
  className,
  errors,
  ...props
}: ComponentProps<"div"> & { errors?: Array<{ message?: string } | undefined> }) {
  const messages = (errors ?? []).map((error) => error?.message).filter(Boolean) as string[];
  const unique = [...new Set(messages)];
  if (unique.length === 0) return null;
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-destructive text-sm font-normal", className)}
      {...props}
    >
      {unique.length === 1 ? (
        unique[0]
      ) : (
        <ul className="ml-4 flex list-disc flex-col gap-1">
          {unique.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
