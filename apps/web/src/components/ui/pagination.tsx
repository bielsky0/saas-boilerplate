import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Pagination primitive (spec §7.1). Previous/Next only — no page numbers.
 *
 * That is a deliberate limit, not an unfinished component: page numbers require a
 * total, a total requires COUNT(*) on every render, and that count is the query
 * that quietly gets expensive as a table grows. Lists here are newest-first and
 * searchable, which is what people actually use.
 *
 * A disabled control is still a link element with `aria-disabled` + neutralized
 * pointer events, rather than a swapped-in <span>: the row keeps its shape and
 * screen readers still announce the control's existence and state.
 */
export function Pagination({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-between gap-2", className)}
      {...props}
    />
  );
}

type PaginationLinkProps = {
  href: string;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function PaginationLink({
  href,
  disabled = false,
  children,
  className,
}: PaginationLinkProps) {
  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <Link
        href={disabled ? "#" : href}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        className={cn(disabled && "pointer-events-none opacity-50")}
      >
        {children}
      </Link>
    </Button>
  );
}
