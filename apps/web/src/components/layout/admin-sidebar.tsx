"use client";

// React Imports
import { type ComponentType } from "react";

import { useCallback, useMemo, useState } from "react";

// I18n Imports (next-intl, NOT next/navigation: usePathname here returns the
// path WITHOUT the locale segment, so `pathname === href` compares directly
// against the locale-free hrefs in the nav config)
import { Link, usePathname } from "@/lib/i18n/navigation";

// Third-party Imports
import * as Icon from "lucide-react";
import { ChevronRightIcon, SquareArrowOutUpRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

// Type Imports
import type {
  MenuGroupSubItem,
  MenuItem,
  MenuLeafSubItem,
  MenuSubItem,
  NavItem,
} from "@/configs/admin-nav";

// Component Imports
import { AdminLogo } from "@/components/layout/admin-logo";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

// Config Imports
import { buildAdminNav } from "@/configs/admin-nav";

// Util Imports
import { cn } from "@/lib/utils";

const isSubGroup = (item: MenuSubItem): item is MenuGroupSubItem => "childItems" in item;

const isExternalLink = (href: string) => href.startsWith("http://") || href.startsWith("https://");

// Key used to track the open state of a nested sub-group, namespaced by its parent
// so two sub-groups sharing a label in different parents never collide.
const subGroupKey = (itemLabel: string, subItemLabel: string) => `${itemLabel}::${subItemLabel}`;

// NOTE (etap 4, faza 4): pathname-only matching. The template also matched
// `?setting=`/`?view=` query strings via `useSearchParams`, but that hook
// suspends on first client render while the server already resolved —
// a hydration mismatch by construction. Our nav has no query-string hrefs,
// so the params contributed nothing; if a future phase adds them, revisit.
function isLinkActive(href: string, activePath: string | undefined, pathname: string): boolean {
  if (activePath) {
    return pathname.startsWith(activePath);
  }

  return pathname === href;
}

// Keys of every branch (top-level item, plus nested sub-group) that contains the active
// route. Branches the user has never toggled fall back to this, so the tree opens itself
// on first render and follows the route on every navigation.
function getActiveBranchKeys(groups: NavItem[], pathname: string): Set<string> {
  const keys = new Set<string>();

  groups.forEach((group) => {
    group.items.forEach((item) => {
      item.childItems?.forEach((subItem) => {
        if (isSubGroup(subItem)) {
          if (
            subItem.childItems.some((leaf) => isLinkActive(leaf.href, leaf.activePath, pathname))
          ) {
            keys.add(item.label);
            keys.add(subGroupKey(item.label, subItem.label));
          }
        } else if (isLinkActive(subItem.href, subItem.activePath, pathname)) {
          keys.add(item.label);
        }
      });
    });
  });

  return keys;
}

// A single navigable link inside the icon-mode flyout, at either nesting level.
const FlyoutMenuLink = ({ item, isActive }: { item: MenuLeafSubItem; isActive: boolean }) => (
  <DropdownMenuItem
    className={cn(
      "justify-between gap-2",
      isActive && "bg-primary/10 text-accent-foreground font-medium",
    )}
    render={<Link href={item.href} target={item.target} />}
  >
    <span className="truncate">{item.label}</span>
    <div className="flex items-center gap-2">
      {item.badge && (
        <span
          className={cn(
            "bg-primary/10 ml-auto rounded-full px-1.5 text-xs font-normal",
            item.badgeClassName,
          )}
        >
          {item.badge}
        </span>
      )}
      {isExternalLink(item.href) && (
        <SquareArrowOutUpRightIcon className="ml-auto size-3.5 shrink-0 opacity-50" />
      )}
    </div>
  </DropdownMenuItem>
);

// Icon-mode stand-in for a collapsible menu item. The rail is too narrow to show the
// inline sub-menu, so the children open in a dropdown to the right of the rail — with
// nested sub-groups rendered as submenus so every leaf stays reachable.
const FlyoutMenuItem = ({
  item,
  childItems,
  isChildActive,
  pathname,
}: {
  item: MenuItem;
  childItems: MenuSubItem[];
  isChildActive: boolean;
  pathname: string;
}) => {
  const Tag = item.icon ? (Icon[item.icon] as ComponentType) : null;

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton isActive={isChildActive} className="data-active:bg-primary/5!" />
          }
        >
          {Tag && <Tag />}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <ChevronRightIcon className="ml-auto" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-auto min-w-52">
          {/* The label must live inside a Group — Base UI's GroupLabel throws without one. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-foreground flex items-center gap-2 text-sm">
              <span className="truncate">{item.label}</span>
              {item.badge && (
                <span
                  className={cn(
                    "bg-primary/10 rounded-full px-1.5 text-xs font-normal",
                    item.badgeClassName,
                  )}
                >
                  {item.badge}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {childItems.map((subItem) =>
              isSubGroup(subItem) ? (
                <DropdownMenuSub key={subItem.label}>
                  <DropdownMenuSubTrigger
                    className={cn(
                      subItem.childItems.some((leaf) =>
                        isLinkActive(leaf.href, leaf.activePath, pathname),
                      ) && "bg-primary/10 text-accent-foreground font-medium",
                    )}
                  >
                    <span className="truncate">{subItem.label}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent sideOffset={9} className="w-auto min-w-48">
                    {subItem.childItems.map((leaf) => (
                      <FlyoutMenuLink
                        key={leaf.label}
                        item={leaf}
                        isActive={isLinkActive(leaf.href, leaf.activePath, pathname)}
                      />
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <FlyoutMenuLink
                  key={subItem.label}
                  item={subItem}
                  isActive={isLinkActive(subItem.href, subItem.activePath, pathname)}
                />
              ),
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

const SidebarGroupedMenuItems = ({
  data,
  groupLabel,
  pathname,
  isIconMode,
  isBranchOpen,
  setOpenItem,
}: {
  data: MenuItem[];
  groupLabel?: string;
  pathname: string;
  isIconMode: boolean;
  isBranchOpen: (key: string) => boolean;
  setOpenItem: (key: string, open: boolean) => void;
}) => {
  return (
    <SidebarGroup>
      {groupLabel && (
        <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase tracking-wider">
          {groupLabel}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {data.map((item) => {
            const Tag = item.icon ? (Icon[item.icon] as ComponentType) : null;

            const isChildActive =
              item.childItems?.some((subItem) =>
                isSubGroup(subItem)
                  ? subItem.childItems.some((leaf) =>
                      isLinkActive(leaf.href, leaf.activePath, pathname),
                    )
                  : isLinkActive(subItem.href, subItem.activePath, pathname),
              ) ?? false;

            if (item.childItems && isIconMode) {
              return (
                <FlyoutMenuItem
                  key={item.label}
                  item={item}
                  childItems={item.childItems}
                  isChildActive={isChildActive}
                  pathname={pathname}
                />
              );
            }

            return item.childItems ? (
              <Collapsible
                className="group/collapsible"
                key={item.label}
                open={isBranchOpen(item.label)}
                onOpenChange={(open) => setOpenItem(item.label, open)}
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger
                    render={
                      <SidebarMenuButton
                        tooltip={item.label}
                        isActive={isChildActive}
                        className="data-active:bg-primary/5!"
                      />
                    }
                  >
                    {Tag && <Tag />}
                    <span className={cn("min-w-0 flex-1 truncate", item.badge && "pr-14")}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <SidebarMenuBadge
                        className={cn(
                          "bg-primary/10 max-w-24 truncate rounded-full px-1.5 font-normal",
                          item.badgeClassName,
                        )}
                      >
                        {item.badge}
                      </SidebarMenuBadge>
                    )}
                    <ChevronRightIcon className="group-data-open/collapsible:rotate-90 ml-auto transition-transform duration-200" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="h-(--collapsible-panel-height) data-ending-style:h-0 data-starting-style:h-0 overflow-hidden transition-all duration-200">
                    <SidebarMenuSub>
                      {item.childItems.map((subItem) =>
                        isSubGroup(subItem) ? (
                          <Collapsible
                            className="group/subcollapsible"
                            key={subItem.label}
                            open={isBranchOpen(subGroupKey(item.label, subItem.label))}
                            onOpenChange={(open) =>
                              setOpenItem(subGroupKey(item.label, subItem.label), open)
                            }
                          >
                            <SidebarMenuSubItem>
                              <CollapsibleTrigger
                                nativeButton={false}
                                render={
                                  <SidebarMenuSubButton
                                    className="data-active:bg-primary/10! justify-between"
                                    isActive={subItem.childItems.some((leaf) =>
                                      isLinkActive(leaf.href, leaf.activePath, pathname),
                                    )}
                                  />
                                }
                              >
                                {subItem.label}
                                <ChevronRightIcon className="group-data-open/subcollapsible:rotate-90 ml-auto shrink-0 transition-transform duration-200" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="h-(--collapsible-panel-height) data-ending-style:h-0 data-starting-style:h-0 overflow-hidden transition-all duration-200">
                                <SidebarMenuSub className="mx-0">
                                  {subItem.childItems.map((leaf) => (
                                    <SidebarMenuSubItem key={leaf.label}>
                                      <SidebarMenuSubButton
                                        className="data-active:bg-primary/10! justify-between"
                                        render={<Link href={leaf.href} target={leaf.target} />}
                                        isActive={isLinkActive(
                                          leaf.href,
                                          leaf.activePath,
                                          pathname,
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "min-w-0 flex-1 truncate",
                                            leaf.badge && isExternalLink(leaf.href) && "pr-8",
                                            leaf.badge && !isExternalLink(leaf.href) && "pr-14",
                                            !leaf.badge && isExternalLink(leaf.href) && "pr-6",
                                          )}
                                        >
                                          {leaf.label}
                                        </span>
                                        {leaf.badge && (
                                          <SidebarMenuBadge
                                            className={cn(
                                              "bg-primary/10 max-w-24 truncate rounded-full px-1.5 font-normal",
                                              isExternalLink(leaf.href) && "right-6",
                                              leaf.badgeClassName,
                                            )}
                                          >
                                            {leaf.badge}
                                          </SidebarMenuBadge>
                                        )}
                                        {isExternalLink(leaf.href) && (
                                          <SquareArrowOutUpRightIcon className="size-3.5! ml-auto shrink-0 opacity-50" />
                                        )}
                                      </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                  ))}
                                </SidebarMenuSub>
                              </CollapsibleContent>
                            </SidebarMenuSubItem>
                          </Collapsible>
                        ) : (
                          <SidebarMenuSubItem key={subItem.label}>
                            <SidebarMenuSubButton
                              className="data-active:bg-primary/10! justify-between"
                              render={<Link href={subItem.href} target={subItem.target} />}
                              isActive={isLinkActive(subItem.href, subItem.activePath, pathname)}
                            >
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate",
                                  subItem.badge && isExternalLink(subItem.href) && "pr-8",
                                  subItem.badge && !isExternalLink(subItem.href) && "pr-14",
                                  !subItem.badge && isExternalLink(subItem.href) && "pr-6",
                                )}
                              >
                                {subItem.label}
                              </span>
                              {subItem.badge && (
                                <SidebarMenuBadge
                                  className={cn(
                                    "bg-primary/10 max-w-24 truncate rounded-full px-1.5 font-normal",
                                    isExternalLink(subItem.href) && "right-6",
                                    subItem.badgeClassName,
                                  )}
                                >
                                  {subItem.badge}
                                </SidebarMenuBadge>
                              )}
                              {isExternalLink(subItem.href) && (
                                <SquareArrowOutUpRightIcon className="size-3.5! ml-auto shrink-0 opacity-50" />
                              )}
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ),
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            ) : (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  tooltip={item.label}
                  render={<Link href={item.href} target={item.target} />}
                  isActive={pathname === item.href}
                  className="data-active:bg-primary/10!"
                >
                  {Tag && <Tag />}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      item.badge && isExternalLink(item.href) && "pr-8",
                      item.badge && !isExternalLink(item.href) && "pr-14",
                      !item.badge && isExternalLink(item.href) && "pr-6",
                    )}
                  >
                    {item.label}
                  </span>
                  {item.badge && (
                    <SidebarMenuBadge
                      className={cn(
                        "bg-primary/10 max-w-24 truncate rounded-full px-1.5 font-normal",
                        isExternalLink(item.href) && "right-6",
                        item.badgeClassName,
                      )}
                    >
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                  {isExternalLink(item.href) && (
                    <SquareArrowOutUpRightIcon className="size-3.5! ml-auto shrink-0 opacity-50" />
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

export function AdminSidebar({
  orgsEnabled,
  showNewOrg,
}: {
  orgsEnabled: boolean;
  showNewOrg: boolean;
}) {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const t = useTranslations("nav.admin");

  // Branches the user has explicitly opened or closed, keyed by label. It lives here rather
  // than inside each Collapsible so it survives the swap between the inline sub-menu and the
  // icon-mode flyout — collapsing and re-expanding the sidebar keeps the tree as it was.
  // Anything absent from this map falls back to "open if it holds the active route".
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  // Nav groups rendered in the sidebar. Labels resolved with literal keys
  // (type-safe); tenancy flags from the server layout — in `disabled` mode
  // there is no org UI.
  const navGroups = useMemo(
    () =>
      buildAdminNav({
        groups: {
          main: t("groups.main"),
          organizations: t("groups.organizations"),
          settings: t("groups.settings"),
        },
        items: {
          dashboard: t("items.dashboard"),
          newOrg: t("items.newOrg"),
          billing: t("items.billing"),
          notifications: t("items.notifications"),
        },
        orgsEnabled,
        showNewOrg,
      }),
    [t, orgsEnabled, showNewOrg],
  );

  const activeBranchKeys = useMemo(
    () => getActiveBranchKeys(navGroups, pathname),
    [navGroups, pathname],
  );

  // A user toggle wins; otherwise the branch mirrors whether it holds the active route.
  const isBranchOpen = useCallback(
    (key: string) => openItems[key] ?? activeBranchKeys.has(key),
    [openItems, activeBranchKeys],
  );

  const setOpenItem = useCallback((key: string, open: boolean) => {
    setOpenItems((prev) => ({ ...prev, [key]: open }));
  }, []);

  // Only the icon rail is too narrow for the inline sub-menu. Mobile renders the full-width
  // sheet, so it keeps the normal tree.
  const isIconMode = state === "collapsed" && !isMobile;

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="bg-transparent! gap-2.5 [&>svg]:size-8"
              render={<Link href="/dashboard" />}
            >
              <AdminLogo />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="group-data-[collapsible=icon]:overflow-y-auto">
        {navGroups.map((navItem, index) => {
          return (
            <SidebarGroupedMenuItems
              key={navItem.groupLabel || index}
              data={navItem.items}
              groupLabel={navItem.groupLabel}
              pathname={pathname}
              isIconMode={isIconMode}
              isBranchOpen={isBranchOpen}
              setOpenItem={setOpenItem}
            />
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
