"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Role + status filters (etap 4, faza 4). Look ported from AdminCN's
 * `user-table-filters`, controls rebuilt on our Radix Select (the template's
 * Base-UI Select takes an `items` prop ours doesn't have).
 */
export function MembersFilters({
  role,
  status,
  onRoleChange,
  onStatusChange,
  roleLabel,
  roleAllLabel,
  statusAllLabel,
  statusLabel,
  roleAriaLabel,
  statusAriaLabel,
}: {
  role: string;
  status: string;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  roleLabel: (role: string) => string;
  roleAllLabel: string;
  statusAllLabel: string;
  statusLabel: (status: string) => string;
  roleAriaLabel: string;
  statusAriaLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={role} onValueChange={onRoleChange}>
        <SelectTrigger className="w-36" aria-label={roleAriaLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{roleAllLabel}</SelectItem>
          <SelectItem value="owner">{roleLabel("owner")}</SelectItem>
          <SelectItem value="admin">{roleLabel("admin")}</SelectItem>
          <SelectItem value="member">{roleLabel("member")}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-36" aria-label={statusAriaLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{statusAllLabel}</SelectItem>
          <SelectItem value="active">{statusLabel("active")}</SelectItem>
          <SelectItem value="invited">{statusLabel("invited")}</SelectItem>
          <SelectItem value="suspended">{statusLabel("suspended")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
