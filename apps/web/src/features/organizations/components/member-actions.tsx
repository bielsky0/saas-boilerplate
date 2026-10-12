"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import {
  Button,
  ConfirmDialog,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@/components/ui";
import { useRemoveMember, useUpdateMemberRole } from "../hooks/use-members";

/**
 * Per-member controls (spec §3.4). Rendered only when the viewer has the
 * matching permission (cosmetic gating — Nest re-checks `members.update_role`
 * / `members.remove` and the last-owner rule).
 * Transport via TanStack Query (etap 4, faza 4) — same endpoints and codes as
 * before, invalidation instead of `router.refresh()`.
 */
export function MemberActions({
  slug,
  membershipId,
  currentRole,
  canUpdateRole,
  canRemove,
}: {
  slug: string;
  membershipId: string;
  currentRole: string;
  canUpdateRole: boolean;
  canRemove: boolean;
}) {
  const [roleError, setRoleError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const t = useTranslations("organizations");
  const updateRole = useUpdateMemberRole(slug);
  const remove = useRemoveMember(slug);
  const rolePending = updateRole.isPending;
  const removePending = remove.isPending;

  async function onRoleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoleError(null);
    const formData = new FormData(event.currentTarget);
    const role = String(formData.get("role") ?? "");
    const result = await updateRole.mutateAsync({ memberId: membershipId, role });
    if (result.ok) {
      toast.success(t("success.roleUpdated"));
      return;
    }
    setRoleError(result.code === "LAST_OWNER" ? t("errors.lastOwnerDemote") : t("errors.generic"));
  }

  async function onRemove() {
    setRemoveError(null);
    const result = await remove.mutateAsync(membershipId);
    if (result.ok) {
      toast.success(t("success.memberRemoved"));
      return;
    }
    setRemoveError(
      result.code === "LAST_OWNER" ? t("errors.lastOwnerRemove") : t("errors.generic"),
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-2">
        {canUpdateRole ? (
          <form onSubmit={onRoleSubmit} className="flex items-center gap-1">
            <Select name="role" defaultValue={currentRole}>
              <SelectTrigger className="h-8 w-32" aria-label={t("members.roleLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">{t("roles.owner")}</SelectItem>
                <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                <SelectItem value="member">{t("roles.member")}</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="ghost" size="sm" disabled={rolePending}>
              {rolePending ? t("members.saving") : t("members.save")}
            </Button>
          </form>
        ) : null}

        {canRemove ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" size="sm" disabled={removePending}>
                {removePending ? t("members.removing") : t("members.remove")}
              </Button>
            }
            title={t("members.confirmRemoveTitle")}
            description={t("members.confirmRemoveBody")}
            confirmLabel={t("members.confirmRemoveAction")}
            onConfirm={onRemove}
            disabled={removePending}
          />
        ) : null}
      </div>
      {roleError ? <FormMessage className="text-xs">{roleError}</FormMessage> : null}
      {removeError ? <FormMessage className="text-xs">{removeError}</FormMessage> : null}
    </div>
  );
}
