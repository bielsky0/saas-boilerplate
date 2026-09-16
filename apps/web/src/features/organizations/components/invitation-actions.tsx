"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button, ConfirmDialog, FormMessage, toast } from "@/components/ui";
import { useRouter } from "@/lib/i18n/navigation";
import { revokeInvitation } from "../client";

/** Revoke a pending invitation (spec §3.3, faza 2.2). Nest re-checks `invitations.revoke`. */
export function RevokeInviteButton({ slug, invitationId }: { slug: string; invitationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = useTranslations("organizations.invitationActions");
  const te = useTranslations("organizations");
  const router = useRouter();

  async function onConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await revokeInvitation(slug, invitationId);
      if (result.ok) {
        toast.success(te("success.invitationRevoked"));
        router.refresh();
        return;
      }
      setError(te("errors.generic"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="sm" disabled={pending}>
            {pending ? t("revoking") : t("revoke")}
          </Button>
        }
        title={t("confirmTitle")}
        description={t("confirmBody")}
        confirmLabel={t("confirmAction")}
        onConfirm={onConfirm}
        disabled={pending}
      />
      {error ? <FormMessage className="text-xs">{error}</FormMessage> : null}
    </div>
  );
}
