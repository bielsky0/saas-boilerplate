"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authAdapter } from "@/lib/adapters/auth";
import { signOut as serverSignOut } from "@/lib/auth";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "./schema";

/**
 * Server actions for the email/password flows (spec 2.1). These are the only
 * callers of the auth adapter from the feature layer. They enforce the password
 * policy via the shared zod schema, keep messaging neutral for anti-enumeration,
 * and let Better Auth's `nextCookies` plugin set the session cookie.
 */

export type FormState = { error?: string };

const GENERIC_ERROR = "Something went wrong. Please try again.";

function safeCallbackUrl(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const result = await authAdapter.signUpEmailPassword(
    { email: parsed.data.email, password: parsed.data.password, name: parsed.data.name },
    await headers(),
  );

  if (!result.ok) {
    if (result.code === "WEAK_PASSWORD") {
      return { error: "Password must be at least 8 characters and include a letter and a number." };
    }
    return { error: GENERIC_ERROR };
  }

  // Neutral outcome for both fresh and already-registered emails (spec 2.1): the
  // redirect target is identical either way. A `callbackUrl` (e.g. an invitation)
  // is carried through so the verify-email page can offer a "continue" link
  // without leaking whether the email already existed.
  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"));
  const target =
    callbackUrl === "/dashboard"
      ? "/verify-email?status=sent"
      : `/verify-email?status=sent&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  redirect(target);
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    // Do not reveal which field/why — keep the single neutral message.
    return { error: "Invalid email or password." };
  }

  const result = await authAdapter.signInEmailPassword(
    { email: parsed.data.email, password: parsed.data.password },
    await headers(),
  );

  if (!result.ok) {
    // Unknown email and wrong password are indistinguishable (spec 2.1).
    if (result.code === "INVALID_CREDENTIALS") {
      return { error: "Invalid email or password." };
    }
    // Suspended/deleted (spec 6.2): only reachable with CORRECT credentials, since
    // the check runs after password verification — so naming the reason enumerates
    // nothing, and a locked-out user otherwise sees "invalid password" forever and
    // files a support ticket we already know the answer to.
    if (result.code === "ACCOUNT_SUSPENDED") {
      return { error: "This account has been suspended. Contact support for help." };
    }
    return { error: GENERIC_ERROR };
  }

  redirect(safeCallbackUrl(formData.get("callbackUrl")));
}

export async function signOutAction(): Promise<void> {
  await serverSignOut();
  redirect("/login");
}

// --- Password reset (spec 2.1) ----------------------------------------------

export type ForgotPasswordState = { error?: string; sent?: boolean };

/**
 * Step 1: email a reset link.
 *
 * ALWAYS reports success, including for an address with no account and for a
 * malformed one. "We sent you a link" must be the only observable outcome, or this
 * form becomes the account-enumeration oracle that sign-in and sign-up are
 * carefully built to avoid — and it would be the easiest one to abuse, since it
 * needs no password guess at all.
 */
export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    // Not even "that isn't an email": same neutral outcome.
    return { sent: true };
  }

  await authAdapter.requestPasswordReset(
    // Same-origin path only; the engine origin-checks it, so this cannot become an
    // open redirect.
    { email: parsed.data.email, redirectTo: "/reset-password" },
    await headers(),
  );

  return { sent: true };
}

export type ResetPasswordState = { error?: string };

/**
 * Step 2: consume the token and set the new password.
 *
 * Every live session for the account dies here (spec 2.1) — handled by the
 * engine's `revokeSessionsOnPasswordReset`, configured in the auth adapter.
 */
export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const result = await authAdapter.resetPassword(
    { token: parsed.data.token, newPassword: parsed.data.password },
    await headers(),
  );

  if (!result.ok) {
    if (result.code === "INVALID_TOKEN") {
      return { error: "This reset link is invalid or has expired. Request a new one." };
    }
    if (result.code === "WEAK_PASSWORD") {
      return { error: "Password must be at least 8 characters and include a letter and a number." };
    }
    return { error: GENERIC_ERROR };
  }

  // Sessions are gone, so there is nothing to sign the user into — send them to
  // log in with the password they just chose.
  redirect("/login?reset=success");
}
