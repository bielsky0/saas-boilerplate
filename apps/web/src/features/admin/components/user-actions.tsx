"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminUserStatus } from "@repo/contracts/admin";
import { Button, ConfirmDialog, FormMessage, Input, toast } from "@/components/ui";
import { deleteUser, setSuperAdmin, suspendUser, unsuspendUser, type AdminCode } from "../client";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * Privileged per-account controls (spec 6.2): suspend/unsuspend,
 * grant/revoke super admin, delete — all over the Nest API (faza 2.6).
 *
 * Gating here is COSMETIC only — Nest re-checks `SuperAdminGuard` and every
 * invariant behind it (spec 4.2's rule, applied to §6). Hiding a button is a
 * courtesy to the admin, never a control.
 *
 * All mutations call Nest directly. After a state-changing mutation the router
 * refreshes so the server-rendered detail shows the new status.
 */
function messageFor(code: AdminCode, action: "unsuspend" | "other"): string {
  switch (code) {
    case "USER_NOT_FOUND":
      return "User not found.";
    case "TARGET_IS_ADMIN":
      return "This user is a super admin. Revoke super-admin access first.";
    case "ALREADY_DELETED":
      return action === "unsuspend"
        ? "This account has been deleted and cannot be reactivated."
        : "This account has been deleted.";
    case "ALREADY_ADMIN":
      return "This user is already a super admin.";
    case "NOT_ADMIN":
      return "This user is not a super admin.";
    case "LAST_ADMIN":
      return "You cannot revoke the last super admin.";
    case "CANNOT_ACT_ON_SELF":
      return "You cannot act on your own account.";
    default:
      return GENERIC_ERROR;
  }
}

export function UserActions({
  userId,
  email,
  status,
  isSuperAdmin,
  isSelf,
  solelyOwnedOrgs,
}: {
  userId: string;
  email: string;
  status: AdminUserStatus;
  isSuperAdmin: boolean;
  isSelf: boolean;
  solelyOwnedOrgs: { id: string; name: string; slug: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const deleted = status === "deleted";

  async function run(action: string, fn: () => Promise<{ ok: boolean; code?: AdminCode }>) {
    setPending(action);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) return true;
      setError(messageFor(result.code ?? "UNKNOWN", "other"));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function handleSuspend() {
    const ok = await run("suspend", () =>
      suspendUser(userId, suspendReason.trim() || undefined).then((r) => r),
    );
    if (ok) {
      toast.success(`${email} has been suspended.`);
      router.refresh();
    }
  }

  async function handleUnsuspend() {
    setPending("unsuspend");
    setError(null);
    try {
      const result = await unsuspendUser(userId);
      if (!result.ok) {
        setError(messageFor(result.code, "unsuspend"));
        return;
      }
      toast.success(`${email} has been reactivated.`);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function handleDelete() {
    const ok = await run("delete", () => deleteUser(userId));
    if (ok) {
      toast.success(`${email} has been deleted.`);
      router.refresh();
    }
  }

  async function handleSetAdmin() {
    const ok = await run("admin", () => setSuperAdmin(userId, isSuperAdmin ? "revoke" : "grant"));
    if (ok) {
      toast.success(
        isSuperAdmin ? `${email} is no longer a super admin.` : `${email} is now a super admin.`,
      );
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!deleted && !isSelf && !isSuperAdmin && status === "active" ? (
          <div className="flex items-center gap-1">
            <Input
              name="reason"
              value={suspendReason}
              onChange={(event) => setSuspendReason(event.target.value)}
              placeholder="Reason (optional)"
              aria-label="Suspension reason"
              className="h-8 w-44 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => void handleSuspend()}
            >
              {pending === "suspend" ? "Suspending…" : "Suspend"}
            </Button>
          </div>
        ) : null}

        {status === "suspended" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending !== null}
            onClick={() => void handleUnsuspend()}
          >
            {pending === "unsuspend" ? "Reactivating…" : "Reactivate"}
          </Button>
        ) : null}

        {!deleted && !isSelf ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" size="sm" disabled={pending !== null}>
                {pending === "admin"
                  ? "Saving…"
                  : isSuperAdmin
                    ? "Revoke super admin"
                    : "Make super admin"}
              </Button>
            }
            title={
              isSuperAdmin ? `Revoke super admin from ${email}?` : `Make ${email} a super admin?`
            }
            description={
              isSuperAdmin
                ? "They lose access to the admin panel and every privileged action."
                : "They gain full access to the admin panel, including account suspension and deletion across every tenant."
            }
            confirmLabel={isSuperAdmin ? "Revoke access" : "Grant access"}
            onConfirm={() => void handleSetAdmin()}
            disabled={pending !== null}
          />
        ) : null}

        {!deleted && !isSelf && !isSuperAdmin ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="destructive" size="sm" disabled={pending !== null}>
                {pending === "delete" ? "Deleting…" : "Delete"}
              </Button>
            }
            title={`Delete ${email}?`}
            description={
              // The cascade is disclosed by name. A super admin may do this —
              // but never without being told exactly what else disappears.
              solelyOwnedOrgs.length > 0
                ? `The account is soft-deleted and retained before permanent removal. They are the only owner of ${solelyOwnedOrgs
                    .map((org) => org.name)
                    .join(", ")} — ${
                    solelyOwnedOrgs.length === 1 ? "that organization" : "those organizations"
                  } will be deleted too.`
                : "The account is soft-deleted and retained before permanent removal. Their sessions end immediately."
            }
            confirmLabel="Delete account"
            onConfirm={() => void handleDelete()}
            disabled={pending !== null}
          />
        ) : null}
      </div>

      {error ? <FormMessage className="text-xs">{error}</FormMessage> : null}
    </div>
  );
}
