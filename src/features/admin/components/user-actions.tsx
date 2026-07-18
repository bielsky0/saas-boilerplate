"use client";

import { useActionState, useEffect, useId } from "react";

import { Button, ConfirmDialog, FormMessage, Input, toast } from "@/components/ui";
import {
  deleteUserAction,
  impersonateUserAction,
  setSuperAdminAction,
  suspendUserAction,
  unsuspendUserAction,
  type ActionState,
} from "../actions";
import type { UserStatus } from "../data";

const initial: ActionState = {};

/**
 * Privileged per-account controls (spec 6.2): impersonate, suspend/unsuspend,
 * grant/revoke super admin, delete.
 *
 * Gating here is COSMETIC only — every action re-checks `requireSuperAdmin()` and
 * its own invariants server-side (spec 4.2's rule, applied to §6). Hiding a button
 * is a courtesy to the admin, never a control.
 *
 * Destructive actions use the `useId()`/`confirmForm` portal pattern: the dialog
 * renders outside the <form>, so the form gets an id and the portaled confirm
 * button submits it via the HTML `form` attribute.
 */
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
  status: UserStatus;
  isSuperAdmin: boolean;
  isSelf: boolean;
  solelyOwnedOrgs: { id: string; name: string; slug: string }[];
}) {
  const [impersonateState, impersonate, impersonatePending] = useActionState(
    impersonateUserAction,
    initial,
  );
  const [suspendState, suspend, suspendPending] = useActionState(suspendUserAction, initial);
  const [unsuspendState, unsuspend, unsuspendPending] = useActionState(
    unsuspendUserAction,
    initial,
  );
  const [deleteState, remove, deletePending] = useActionState(deleteUserAction, initial);
  const [adminState, setAdmin, adminPending] = useActionState(setSuperAdminAction, initial);

  const impersonateFormId = useId();
  const deleteFormId = useId();
  const adminFormId = useId();

  useEffect(() => {
    if (suspendState.success) toast.success(suspendState.success);
  }, [suspendState]);
  useEffect(() => {
    if (unsuspendState.success) toast.success(unsuspendState.success);
  }, [unsuspendState]);
  useEffect(() => {
    if (deleteState.success) toast.success(deleteState.success);
  }, [deleteState]);
  useEffect(() => {
    if (adminState.success) toast.success(adminState.success);
  }, [adminState]);

  const deleted = status === "deleted";
  const errors = [
    impersonateState.error,
    suspendState.error,
    unsuspendState.error,
    deleteState.error,
    adminState.error,
  ].filter(Boolean);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* A super admin is never impersonable (the engine refuses), and neither
            is a deleted account — so don't offer either. */}
        {!deleted && !isSelf && !isSuperAdmin ? (
          <>
            <form id={impersonateFormId} action={impersonate}>
              <input type="hidden" name="userId" value={userId} />
            </form>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" size="sm" disabled={impersonatePending}>
                  {impersonatePending ? "Starting…" : "Impersonate"}
                </Button>
              }
              title={`Impersonate ${email}?`}
              description="You will be signed in as this user for up to 30 minutes. A banner will show admin mode the whole time. Your reason is recorded in the audit log, where this user's organization admins can see it."
              body={
                /* `form={impersonateFormId}` for the same reason the confirm
                   button needs it: the dialog is portaled to document.body, so
                   this input is outside the <form> in the DOM. `required` is a
                   courtesy — impersonateUserSchema is the actual gate. */
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">Reason</span>
                  <Input
                    name="reason"
                    form={impersonateFormId}
                    required
                    minLength={10}
                    maxLength={500}
                    placeholder="e.g. Ticket #482 — user reports checkout failing"
                    aria-label="Reason for impersonating this account"
                  />
                </label>
              }
              confirmLabel="Start impersonating"
              confirmForm={impersonateFormId}
              disabled={impersonatePending}
            />
          </>
        ) : null}

        {!deleted && !isSelf && !isSuperAdmin && status === "active" ? (
          <form action={suspend} className="flex items-center gap-1">
            <input type="hidden" name="userId" value={userId} />
            <Input
              name="reason"
              placeholder="Reason (optional)"
              aria-label="Suspension reason"
              className="h-8 w-44 text-xs"
            />
            <Button type="submit" variant="outline" size="sm" disabled={suspendPending}>
              {suspendPending ? "Suspending…" : "Suspend"}
            </Button>
          </form>
        ) : null}

        {status === "suspended" ? (
          <form action={unsuspend}>
            <input type="hidden" name="userId" value={userId} />
            <Button type="submit" variant="outline" size="sm" disabled={unsuspendPending}>
              {unsuspendPending ? "Reactivating…" : "Reactivate"}
            </Button>
          </form>
        ) : null}

        {!deleted && !isSelf ? (
          <>
            <form id={adminFormId} action={setAdmin}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="value" value={isSuperAdmin ? "revoke" : "grant"} />
            </form>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" disabled={adminPending}>
                  {adminPending
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
                  : "They gain full access to the admin panel, including impersonation and account deletion across every tenant."
              }
              confirmLabel={isSuperAdmin ? "Revoke access" : "Grant access"}
              confirmForm={adminFormId}
              disabled={adminPending}
            />
          </>
        ) : null}

        {!deleted && !isSelf && !isSuperAdmin ? (
          <>
            <form id={deleteFormId} action={remove}>
              <input type="hidden" name="userId" value={userId} />
            </form>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive" size="sm" disabled={deletePending}>
                  {deletePending ? "Deleting…" : "Delete"}
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
              confirmForm={deleteFormId}
              disabled={deletePending}
            />
          </>
        ) : null}
      </div>

      {errors.map((error) => (
        <FormMessage key={error} className="text-xs">
          {error}
        </FormMessage>
      ))}
    </div>
  );
}
