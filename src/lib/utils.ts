import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class-name composer for the design system (spec §7.1). `clsx` resolves
 * conditional/array class inputs; `tailwind-merge` de-duplicates conflicting
 * Tailwind utilities so a caller's `className` can always override a component's
 * defaults (e.g. `<Button className="bg-red-500">`). Every UI primitive composes
 * its classes through this helper — see `src/components/ui/*`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
