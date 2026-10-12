"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button, ConfirmDialog, FormMessage, toast } from "@/components/ui";
import { useRevokeInvitation } from "../hooks/use-members";

/** Revoke a pending invitation (spec §3.3). Nest re-checks `invitations.revoke`.
 * Transport via TanStack Query (etap 4, faza 4) — same endpoint and codes as
 * before, invalidation instead of `router.refresh()`. */
export function RevokeInviteButton({ slug, invitationId }: { slug: string; invitationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("organizations.invitationActions");
  const te = useTranslations("organizations");
  const revoke = useRevokeInvitation(slug);

  async function onConfirm() {
    setError(null);
    const result = await revoke.mutateAsync(invitationId);
    if (result.ok) {
      toast.success(te("success.invitationRevoked"));
      return;
    }
    setError(te("errors.generic"));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="sm" disabled={revoke.isPending}>
            {revoke.isPending ? t("revoking") : t("revoke")}
          </Button>
        }
        title={t("confirmTitle")}
        description={t("confirmBody")}
        confirmLabel={t("confirmAction")}
        onConfirm={onConfirm}
        disabled={revoke.isPending}
      />
      {error ? <FormMessage className="text-xs">{error}</FormMessage> : null}
    </div>
  );
}
