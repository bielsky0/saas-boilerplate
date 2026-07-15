"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Dropdown } from "@/components/ui";

/**
 * Global account/context switcher (spec 3.5). Lists the personal account + every
 * org the user actively belongs to; selecting one navigates to that context's
 * URL (`/dashboard` or `/orgs/[slug]`). The active item is derived from the
 * current path, so refresh/deep-links keep context. UI only — access is enforced
 * server-side per route.
 */
export type SwitcherOrg = { id: string; name: string; slug: string };

const itemClass =
  "block rounded px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10";
const activeClass = "bg-black/5 font-medium dark:bg-white/10";

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
    <Dropdown trigger={<span className="max-w-40 truncate">{current}</span>}>
      <div className="px-3 py-1 text-xs uppercase tracking-wide opacity-50">Personal</div>
      <Link
        href="/dashboard"
        role="menuitem"
        className={`${itemClass} ${onPersonal ? activeClass : ""}`}
      >
        {personalLabel}
      </Link>

      {orgs.length > 0 ? (
        <>
          <div className="mt-1 px-3 py-1 text-xs uppercase tracking-wide opacity-50">
            Organizations
          </div>
          {orgs.map((org) => (
            <Link
              key={org.id}
              href={`/orgs/${org.slug}`}
              role="menuitem"
              className={`${itemClass} ${org.slug === activeSlug ? activeClass : ""}`}
            >
              {org.name}
            </Link>
          ))}
        </>
      ) : null}

      <div className="my-1 border-t border-black/10 dark:border-white/10" />
      <Link href="/orgs/new" role="menuitem" className={itemClass}>
        + New organization
      </Link>
    </Dropdown>
  );
}
