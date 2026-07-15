import type { ButtonHTMLAttributes } from "react";

/**
 * Token-driven button primitive (spec 7.1). Presentational only — no data
 * access. First real design-system component; more variants land with the UI
 * system phase.
 */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

const base =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

const variants = {
  primary: "bg-foreground text-background hover:opacity-90",
  ghost: "bg-transparent hover:bg-black/5 dark:hover:bg-white/10",
} as const;

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
