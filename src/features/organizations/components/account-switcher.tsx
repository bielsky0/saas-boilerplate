"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/lib/i18n/navigation";

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
 *
 * `showNewOrg` is REQUIRED rather than defaulted (spec §1.4): the mode table has
 * exactly one call site, and a default would let it silently drift out of sync
 * with MULTI_TENANCY_MODE. In `disabled` the whole component is never rendered.
 */
export type SwitcherOrg = { id: string; name: string; slug: string };

export function AccountSwitcher({
  personalLabel,
  orgs,
  showNewOrg,
}: {
  personalLabel: string;
  orgs: SwitcherOrg[];
  showNewOrg: boolean;
}) {
  const t = useTranslations("organizations.switcher");
  const pathname = usePathname();
  const activeSlug = pathname.startsWith("/orgs/") ? pathname.split("/")[2] : undefined;
  const onPersonal = !activeSlug;
  const current = activeSlug
    ? (orgs.find((o) => o.slug === activeSlug)?.name ?? t("organization"))
    : personalLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={t("label")}
          className="max-w-52 justify-between gap-2"
        >
          <span className="truncate">{current}</span>
          <ChevronsUpDown className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>{t("personal")}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className={cn(onPersonal && "font-medium")}>
            {personalLabel}
          </Link>
        </DropdownMenuItem>

        {orgs.length > 0 ? (
          <>
            <DropdownMenuLabel>{t("organizations")}</DropdownMenuLabel>
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

        {showNewOrg ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/orgs/new">
                <Plus className="mr-2 size-4" /> {t("newOrg")}
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
