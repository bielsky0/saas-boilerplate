"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CrownIcon, ShieldCheckIcon, UserRoundIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MemberActions } from "../member-actions";
import type { OrgMember } from "../../hooks/use-members";

/**
 * Members table columns (etap 4, faza 4). Look ported from AdminCN's
 * `user-table-columns`, model cut to what Nest returns: member (initials
 * avatar, no `/images/avatars/*`), role (our `owner/admin/member` enum),
 * status (`active/invited/suspended`), joined (`Intl`, not `date-fns`).
 * `plan`/`billing` columns don't exist in our model — dropped, not faked.
 * Row actions are the existing permission-gated `MemberActions`, not the
 * template's mock Edit/Suspend/Delete menu.
 */

const ROLE_ICONS: Record<string, ReactNode> = {
  owner: <CrownIcon className="size-4 text-amber-600 dark:text-amber-400" />,
  admin: <ShieldCheckIcon className="size-4 text-green-600 dark:text-green-400" />,
  member: <UserRoundIcon className="text-muted-foreground size-4" />,
};

const STATUS_STYLES: Record<string, string> = {
  active:
    "bg-green-600/10 text-green-600 focus-visible:ring-green-600/20 dark:bg-green-400/10 dark:text-green-400 dark:focus-visible:ring-green-400/40",
  invited:
    "bg-amber-600/10 text-amber-600 focus-visible:ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-400 dark:focus-visible:ring-amber-400/40",
  suspended:
    "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
};

export function buildMemberColumns(opts: {
  tCustomer: string;
  tRole: string;
  tStatus: string;
  tJoined: string;
  tActions: string;
  roleLabel: (role: string) => string;
  statusLabels: Record<string, string>;
  formatDate: (iso: string) => string;
  initialsOf: (name: string | null, email: string) => string;
  slug: string;
  canUpdateRole: boolean;
  canRemove: boolean;
}): ColumnDef<OrgMember>[] {
  const showActions = opts.canUpdateRole || opts.canRemove;
  const columns: ColumnDef<OrgMember>[] = [
    {
      id: "member",
      header: opts.tCustomer,
      accessorFn: (row) => row.name ?? row.email,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-9">
            <AvatarFallback className="text-xs">
              {opts.initialsOf(row.original.name, row.original.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name ?? row.original.email}</span>
            <span className="text-muted-foreground text-sm">{row.original.email}</span>
          </div>
        </div>
      ),
      enableSorting: true,
    },
    {
      id: "role",
      header: opts.tRole,
      accessorKey: "role",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {ROLE_ICONS[row.original.role] ?? (
            <UserRoundIcon className="text-muted-foreground size-4" />
          )}
          <span className="capitalize">{opts.roleLabel(row.original.role)}</span>
        </div>
      ),
      enableSorting: true,
    },
    {
      id: "status",
      header: opts.tStatus,
      accessorKey: "status",
      cell: ({ row }) => (
        <Badge
          className={`h-auto rounded-sm border-none capitalize focus-visible:outline-none ${STATUS_STYLES[row.original.status] ?? ""}`}
        >
          {opts.statusLabels[row.original.status] ?? row.original.status}
        </Badge>
      ),
      enableSorting: true,
    },
    {
      id: "joined",
      header: opts.tJoined,
      accessorKey: "createdAt",
      cell: ({ row }) => <span>{opts.formatDate(row.original.createdAt)}</span>,
      enableSorting: true,
    },
  ];
  if (showActions) {
    columns.push({
      id: "actions",
      header: () => opts.tActions,
      cell: ({ row }) => (
        <MemberActions
          slug={opts.slug}
          membershipId={row.original.id}
          currentRole={row.original.role}
          canUpdateRole={opts.canUpdateRole}
          canRemove={opts.canRemove}
        />
      ),
      enableHiding: false,
      enableSorting: false,
    });
  }
  return columns;
}
