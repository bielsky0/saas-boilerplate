import type { LabelHTMLAttributes, ReactNode } from "react";

/**
 * Label + field wrapper primitives (spec 7.1). Presentational only.
 */
export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={"text-sm font-medium " + className} {...props} />;
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
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
