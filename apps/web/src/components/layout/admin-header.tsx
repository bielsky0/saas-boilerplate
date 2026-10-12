"use client";

import { Fragment } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { AdminProfileMenu } from "@/components/layout/admin-profile-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SignOutButton } from "@/features/auth";
import { NotificationBell } from "@/features/notifications";
import { AccountSwitcher } from "@/features/organizations";
import type { SwitcherOrg } from "@/features/organizations/components/account-switcher";
import { usePathname } from "@/lib/i18n/navigation";

/**
 * Tenant-shell header (etap 4, faza 2). Layout ported from AdminCN's `Header`
 * (sidebar trigger + breadcrumb left, controls right) with our controls:
 * `AccountSwitcher`, `NotificationBell`, `ThemeToggle`, `LocaleSwitcher`
 * (replaces the template's fake `LanguageDropdown`), `AdminProfileMenu`
 * (session data instead of STATIC_USER) and the standalone `SignOutButton`
 * (kept out of the dropdown so existing E2E `getByRole("button", /sign out/i)`
 * keeps passing).
 *
 * `usePathname` is next-intl's — it already strips the `[locale]` segment,
 * so breadcrumb segments map 1:1 to nav hrefs.
 */
export function AdminHeader({
  user,
  personalLabel,
  orgs,
  showSwitcher,
  showNewOrg,
}: {
  user: { name: string | null; email: string };
  personalLabel: string;
  orgs: SwitcherOrg[];
  showSwitcher: boolean;
  showNewOrg: boolean;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <header className="bg-card sticky top-0 z-50 border-b">
      <div className="max-w-360 mx-auto flex items-center justify-between gap-6 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <SidebarTrigger className="[&_svg]:size-5!" />
          <Separator
            orientation="vertical"
            className="h-4! data-vertical:self-center hidden sm:block"
          />
          <Breadcrumb className="hidden sm:block">
            <BreadcrumbList>
              {segments.map((segment, index) => {
                const isLast = index === segments.length - 1;
                const label = segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                const href = `/${segments.slice(0, index + 1).join("/")}`;

                return (
                  <Fragment key={href}>
                    <BreadcrumbItem>
                      {/* Same as the template: intermediate crumbs are labels,
                          not links — BreadcrumbLink here is a plain <a>
                          without href support for `render`. */}
                      {isLast ? (
                        <BreadcrumbPage>{label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink>{label}</BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
          {showSwitcher ? (
            <AccountSwitcher personalLabel={personalLabel} orgs={orgs} showNewOrg={showNewOrg} />
          ) : null}
          <NotificationBell />
          <ThemeToggle />
          <LocaleSwitcher />
          <AdminProfileMenu user={user} />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
