import type * as Icon from "lucide-react";

type IconName = keyof typeof Icon;

export type MenuLeafSubItem = {
  label: string;
  href: string;
  activePath?: string;
  badge?: string;
  badgeClassName?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
};

export type MenuGroupSubItem = {
  label: string;
  childItems: MenuLeafSubItem[];
};

export type MenuSubItem = MenuLeafSubItem | MenuGroupSubItem;

export type MenuItem = {
  icon: IconName;
  label: string;
} & (
  | {
      href: string;
      badge?: string;
      badgeClassName?: string;
      childItems?: never;
      target?: "_blank" | "_self" | "_parent" | "_top";
    }
  | {
      href?: never;
      badge?: string;
      badgeClassName?: string;
      childItems: MenuSubItem[];
    }
);

export type NavItem = {
  groupLabel?: string;
  items: MenuItem[];
};

/**
 * Tenant-shell navigation (etap 4, faza 2). Shape ported 1:1 from AdminCN's
 * `navConfig.tsx` (including `isLinkActive` support for `?setting=`/`?view=`
 * tabs, used by fazy 4–5) — but ONLY local entries. All `Pro`/external promo
 * items are dropped, never to return.
 *
 * Labels come from `useTranslations("nav.admin")`, so this is a BUILDER, not
 * a constant: it needs the translator. Tenancy flags (spec §1.4) decide
 * which groups exist at all — in `disabled` mode there is no org UI anywhere,
 * sidebar included.
 *
 * Fazy 3–4 append groups here (Orders detail, Users) — the structure is ready.
 */
export function buildAdminNav(opts: {
  groups: { main: string; organizations: string; settings: string; apps: string; demo: string };
  items: {
    dashboard: string;
    newOrg: string;
    billing: string;
    notifications: string;
    mail: string;
    calendar: string;
    demoForms: string;
    demoVertical: string;
    demoHorizontal: string;
    demoValidation: string;
    demoDatatable: string;
    demoError: string;
    demoMenuLevel: string;
    demoMenuItem: string;
    demoMenuLevel1: string;
    demoMenuLevel2: string;
  };
  orgsEnabled: boolean;
  showNewOrg: boolean;
}): NavItem[] {
  const groups: NavItem[] = [
    {
      groupLabel: opts.groups.main,
      items: [{ icon: "LayoutDashboard", label: opts.items.dashboard, href: "/dashboard" }],
    },
  ];

  if (opts.orgsEnabled) {
    const items: MenuItem[] = [];
    if (opts.showNewOrg) {
      items.push({ icon: "Plus", label: opts.items.newOrg, href: "/orgs/new" });
    }
    if (items.length > 0) {
      groups.push({ groupLabel: opts.groups.organizations, items });
    }
  }

  groups.push({
    groupLabel: opts.groups.apps,
    items: [
      { icon: "MailIcon", label: opts.items.mail, href: "/apps/mail" },
      { icon: "CalendarIcon", label: opts.items.calendar, href: "/apps/calendar" },
    ],
  });

  groups.push({
    groupLabel: opts.groups.demo,
    items: [
      {
        icon: "LayoutTemplateIcon",
        label: opts.items.demoForms,
        childItems: [
          { label: opts.items.demoVertical, href: "/demo/forms/vertical" },
          { label: opts.items.demoHorizontal, href: "/demo/forms/horizontal" },
          { label: opts.items.demoValidation, href: "/demo/forms/validation" },
        ],
      },
      { icon: "TableIcon", label: opts.items.demoDatatable, href: "/demo/datatable" },
      { icon: "BugIcon", label: opts.items.demoError, href: "/demo/error" },
      {
        icon: "MenuIcon",
        label: opts.items.demoMenuLevel,
        childItems: [
          { label: opts.items.demoMenuItem, href: "#" },
          {
            label: opts.items.demoMenuLevel1,
            childItems: [{ label: opts.items.demoMenuLevel2, href: "#" }],
          },
        ],
      },
    ],
  });

  groups.push({
    groupLabel: opts.groups.settings,
    items: [
      { icon: "CreditCard", label: opts.items.billing, href: "/settings/billing" },
      { icon: "Bell", label: opts.items.notifications, href: "/settings/notifications" },
    ],
  });

  return groups;
}
