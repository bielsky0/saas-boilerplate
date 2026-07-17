"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { authAdapter } from "@/lib/adapters/auth";
import { signOut as serverSignOut } from "@/lib/auth";
import { LOCALE_COOKIE, type Locale, withLocale } from "@/lib/i18n/config";
import { storedLocaleForEmail } from "@/lib/i18n/user-locale";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "./schema";

/**
 * Server actions for the email/password flows (spec 2.1). These are the only
 * callers of the auth adapter from the feature layer. They enforce the password
 * policy via the shared zod schema, keep messaging neutral for anti-enumeration,
 * and let Better Auth's `nextCookies` plugin set the session cookie.
 *
 * ─── The translation seam (spec 16.1) ───────────────────────────────────────
 *
 * The adapter returns CODES, never prose (`AuthResult = { ok: false; code }`), so
 * these actions are the one place a code becomes a sentence. That is what makes
 * §16 a small change here rather than a rewrite: the vocabulary was already
 * vendor-neutral, and translating it is just choosing a different string for the
 * same code.
 *
 * ⚠️ ANTI-ENUMERATION IS NOW A PROPERTY OF THE KEY, NOT OF THE COPY. §2.1 demands
 * that "wrong password" and "no such account" be indistinguishable, and
 * e2e/login-enumeration.spec.ts asserts the two strings are byte-identical. With
 * one hard-coded English literal repeated twice, that held by inspection. With
 * translations it cannot: two keys with the same English value can diverge the
 * moment a translator touches one of them, in a language nobody on the team reads,
 * and the E2E — pinned to en-US — would never catch it.
 *
 * So there is exactly ONE key, `auth.errors.invalidCredentials`, referenced from
 * both branches. Then no translation of any language can break the guarantee,
 * because there is only one string to translate. Never split it "for clarity".
 */

export type FormState = { error?: string };

function safeCallbackUrl(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const [t, tv] = await Promise.all([
    getTranslations("auth.errors"),
    getTranslations("auth.validation"),
  ]);
  const parsed = signUpSchema(tv).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("generic") };
  }

  const result = await authAdapter.signUpEmailPassword(
    { email: parsed.data.email, password: parsed.data.password, name: parsed.data.name },
    await headers(),
  );

  if (!result.ok) {
    if (result.code === "WEAK_PASSWORD") {
      return { error: t("weakPassword") };
    }
    return { error: t("generic") };
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
  const [t, tv] = await Promise.all([
    getTranslations("auth.errors"),
    getTranslations("auth.validation"),
  ]);
  const parsed = signInSchema(tv).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    // Do not reveal which field/why — keep the single neutral message. Note this
    // discards the zod messages ON PURPOSE: "Enter your password." would tell an
    // attacker their email parsed fine.
    return { error: t("invalidCredentials") };
  }

  const result = await authAdapter.signInEmailPassword(
    { email: parsed.data.email, password: parsed.data.password },
    await headers(),
  );

  if (!result.ok) {
    // Unknown email and wrong password are indistinguishable (spec 2.1). SAME KEY
    // as the parse failure above — see this file's header. One key, three call
    // sites, so no translation can pull them apart.
    if (result.code === "INVALID_CREDENTIALS") {
      return { error: t("invalidCredentials") };
    }
    // Suspended/deleted (spec 6.2): only reachable with CORRECT credentials, since
    // the check runs after password verification — so naming the reason enumerates
    // nothing, and a locked-out user otherwise sees "invalid password" forever and
    // files a support ticket we already know the answer to.
    if (result.code === "ACCOUNT_SUSPENDED") {
      return { error: t("accountSuspended") };
    }
    return { error: t("generic") };
  }

  /*
   * SIGN-IN IS WHERE THE DURABLE STORE SEEDS THE REQUEST-TIME CACHE (spec 16.1).
   *
   * The proxy negotiates from a cookie and must never query the database, so a
   * preference saved on a laptop is invisible on a phone until something puts it
   * in that device's cookie. This is that something: it is the one moment we know
   * both who the user is and that they are starting a fresh session.
   *
   * The read is by EMAIL, not from the session: `headers()` returns the request
   * headers, and the session cookie the engine just minted is only on the
   * response — so `getServerSession()` here would still see the anonymous request.
   * See localeForEmail's header.
   */
  return finishSignIn(formData, await storedLocaleForEmail(parsed.data.email));
}

/**
 * Land the user in their own language.
 *
 * Split out because it must run AFTER the `!result.ok` returns above: `redirect()`
 * throws, so nothing may follow it, and the locale work has to sit between the
 * last error branch and the throw.
 */
async function finishSignIn(formData: FormData, stored: Locale | null): Promise<never> {
  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"));

  /*
   * NO BACKFILL when the user never chose (`stored === null`). Writing the
   * browser's current language into `user.locale` here would launder "their
   * browser said en" into "they chose en" — and that fabricated preference would
   * then outrank the browser forever, including after they change it. A user who
   * has never picked a language keeps negotiating, which is the honest answer.
   */
  if (!stored) redirect(callbackUrl);

  (await cookies()).set(LOCALE_COOKIE, stored, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });

  // The cookie only takes effect on the NEXT request, and this redirect is that
  // request — so the target must carry the locale explicitly rather than trust
  // negotiation to catch up.
  redirect(withLocale(callbackUrl, stored));
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
  // No error translator needed: this action has exactly one outcome, by design.
  const tv = await getTranslations("auth.validation");
  const parsed = forgotPasswordSchema(tv).safeParse({ email: formData.get("email") });
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
  const [t, tv] = await Promise.all([
    getTranslations("auth.errors"),
    getTranslations("auth.validation"),
  ]);
  const parsed = resetPasswordSchema(tv).safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("generic") };
  }

  const result = await authAdapter.resetPassword(
    { token: parsed.data.token, newPassword: parsed.data.password },
    await headers(),
  );

  if (!result.ok) {
    if (result.code === "INVALID_TOKEN") {
      return { error: t("resetLinkExpired") };
    }
    if (result.code === "WEAK_PASSWORD") {
      return { error: t("weakPassword") };
    }
    return { error: t("generic") };
  }

  // Sessions are gone, so there is nothing to sign the user into — send them to
  // log in with the password they just chose.
  redirect("/login?reset=success");
}
