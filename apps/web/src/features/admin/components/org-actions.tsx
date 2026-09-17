"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, ConfirmDialog, FormMessage, toast } from "@/components/ui";
import { deleteOrganization } from "../client";

/**
 * Organization-level admin controls (spec 6.2): deletion over the Nest API
 * (faza 2.6). Cosmetic gating only — Nest re-checks `SuperAdminGuard`
 * server-side.
 */
export function OrgActions({
  organizationId,
  name,
  memberCount,
  deleted,
}: {
  organizationId: string;
  name: string;
  memberCount: number;
  deleted: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const result = await deleteOrganization(organizationId);
      if (!result.ok) {
        setError(
          result.code === "ALREADY_DELETED"
            ? "This organization is already deleted."
            : "Something went wrong. Please try again.",
        );
        return;
      }
      toast.success(`${name} has been deleted.`);
      router.push("/admin/organizations");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (deleted) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <ConfirmDialog
        trigger={
          <Button type="button" variant="destructive" size="sm" disabled={pending}>
            {pending ? "Deleting…" : "Delete organization"}
          </Button>
        }
        title={`Delete ${name}?`}
        description={`The organization is soft-deleted and retained before permanent removal. ${memberCount} member${
          memberCount === 1 ? "" : "s"
        } lose access immediately. User accounts are not deleted.`}
        confirmLabel="Delete organization"
        onConfirm={() => void handleDelete()}
        disabled={pending}
      />
      {error ? <FormMessage className="text-xs">{error}</FormMessage> : null}
    </div>
  );
}
