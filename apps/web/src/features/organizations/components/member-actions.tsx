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
import { useRouter } from "@/lib/i18n/navigation";
import { removeMember, updateMemberRole } from "../client";

/**
 * Per-member controls (spec §3.4, faza 2.2): change role + remove. Rendered
 * only when the viewer has the matching permission (cosmetic gating — Nest
 * re-checks `members.update_role` / `members.remove` and the last-owner rule).
 * Removal is confirmed in a dialog; failures stay inline, successes toast and
 * refresh the list.
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
  const [rolePending, setRolePending] = useState(false);
  const [removePending, setRemovePending] = useState(false);
  const t = useTranslations("organizations");
  const router = useRouter();

  async function onRoleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRolePending(true);
    setRoleError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const role = String(formData.get("role") ?? "");
      const result = await updateMemberRole(slug, membershipId, role);
      if (result.ok) {
        toast.success(t("success.roleUpdated"));
        router.refresh();
        return;
      }
      setRoleError(
        result.code === "LAST_OWNER" ? t("errors.lastOwnerDemote") : t("errors.generic"),
      );
    } finally {
      setRolePending(false);
    }
  }

  async function onRemove() {
    setRemovePending(true);
    setRemoveError(null);
    try {
      const result = await removeMember(slug, membershipId);
      if (result.ok) {
        toast.success(t("success.memberRemoved"));
        router.refresh();
        return;
      }
      setRemoveError(
        result.code === "LAST_OWNER" ? t("errors.lastOwnerRemove") : t("errors.generic"),
      );
    } finally {
      setRemovePending(false);
    }
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
