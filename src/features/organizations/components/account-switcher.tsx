"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Global account/context switcher (spec §3.5). Lists the personal account + every
 * org the user actively belongs to; selecting one navigates to that context's
 * URL (`/dashboard` or `/orgs/[slug]`). The active item is derived from the
 * current path, so refresh/deep-links keep context. UI only — access is enforced
 * server-side per route.
 */
export type SwitcherOrg = { id: string; name: string; slug: string };

export function AccountSwitcher({
  personalLabel,
  orgs,
}: {
  personalLabel: string;
  orgs: SwitcherOrg[];
}) {
  const pathname = usePathname();
  const activeSlug = pathname.startsWith("/orgs/") ? pathname.split("/")[2] : undefined;
  const onPersonal = !activeSlug;
  const current = activeSlug
    ? (orgs.find((o) => o.slug === activeSlug)?.name ?? "Organization")
    : personalLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Switch account"
          className="max-w-52 justify-between gap-2"
        >
          <span className="truncate">{current}</span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>Personal</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className={cn(onPersonal && "font-medium")}>
            {personalLabel}
          </Link>
        </DropdownMenuItem>

        {orgs.length > 0 ? (
          <>
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {orgs.map((org) => (
              <DropdownMenuItem key={org.id} asChild>
                <Link
                  href={`/orgs/${org.slug}`}
                  className={cn(org.slug === activeSlug && "font-medium")}
                >
                  {org.name}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/orgs/new">
            <Plus className="mr-2 size-4" /> New organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
