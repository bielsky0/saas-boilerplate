"use client";

import { Suspense, type ReactNode } from "react";

import { AdminFooter } from "@/components/layout/admin-footer";
import { AdminHeader } from "@/components/layout/admin-header";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SwitcherOrg } from "@/features/organizations/components/account-switcher";

/**
 * Tenant-shell root (etap 4, faza 2). Client boundary between the RSC layout
 * (guard + data) and the AdminCN chrome: `SidebarProvider` state, tooltips,
 * sidebar, header, footer. `SidebarProvider defaultOpen` is statically true —
 * like the template, which writes the `sidebar_state` cookie client-side but
 * never reads it on the server.
 *
 * `AdminSidebar` sits in `Suspense` because it reads `useSearchParams` (active
 * menu state for `?setting=`/`?view=` tabs) — same as the template's
 * `(pages)/layout.tsx`.
 */
export function AdminShell({
  user,
  personalLabel,
  orgs,
  showSwitcher,
  showNewOrg,
  orgsEnabled,
  children,
}: {
  user: { name: string | null; email: string };
  personalLabel: string;
  orgs: SwitcherOrg[];
  showSwitcher: boolean;
  showNewOrg: boolean;
  orgsEnabled: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen>
      <TooltipProvider>
        <div className="flex h-full min-h-dvh w-full min-w-0">
          <Suspense>
            <AdminSidebar orgsEnabled={orgsEnabled} showNewOrg={showNewOrg} />
          </Suspense>
          <SidebarInset className="flex flex-1 flex-col">
            <AdminHeader
              user={user}
              personalLabel={personalLabel}
              orgs={orgs}
              showSwitcher={showSwitcher}
              showNewOrg={showNewOrg}
            />
            <main className="max-w-360 mx-auto size-full flex-1 px-4 py-6 sm:px-6">{children}</main>
            <AdminFooter />
          </SidebarInset>
        </div>
      </TooltipProvider>
    </SidebarProvider>
  );
}
