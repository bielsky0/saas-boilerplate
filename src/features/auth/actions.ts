"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { authAdapter } from "@/lib/adapters/auth";
import { rateLimit } from "@/lib/adapters/rate-limit";
import { signOut as serverSignOut } from "@/lib/auth";
import { env } from "@/lib/env/server";
import { LOCALE_COOKIE, type Locale, withLocale } from "@/lib/i18n/config";
import { storedLocaleForEmail } from "@/lib/i18n/user-locale";
import { LOGIN_RULE, loginRateLimitKey } from "@/lib/security/rate-limit";
import { type FormState as SharedFormState, invalid } from "@/lib/validation";
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
 *
 * ─── Rate limiting, and why it does NOT threaten the invariant above (§2.1) ──
 *
 * §2.1 asks for two things in one bullet: throttled sign-in attempts, and a
 * message that does not reveal whether an email exists. Those pull against each
 * other, because "too many attempts" is a NEW observable — so the keying decides
 * whether it is an oracle.
 *
 * KEYED ON THE CLIENT IP, NEVER ON THE SUBMITTED EMAIL. An oracle exists exactly
 * when the observable varies with whether the account exists. An IP-keyed bucket
 * is a function of THIS CLIENT'S recent failures and nothing else: five failures
 * against a ghost address and five against a real one produce byte-identical
 * state and byte-identical output. The attacker learns only that they have been
 * failing, which they knew. So the distinct message is safe here — and worth
 * showing, because a locked-out user told "invalid email or password" concludes
 * their password is wrong and resets a password that was fine.
 *
 * Account-keyed limiting is rejected for three reasons, the last of which is the
 * one people miss:
 *   1. if the message differs, the Nth attempt is a perfect oracle;
 *   2. the NATURAL implementation only creates a counter where the code reaches
 *      the "wrong password" branch — which it only does for accounts that EXIST.
 *      Getting it right means counting the submitted string before any lookup,
 *      which lets an attacker fill the store with arbitrary keys;
 *   3. it is an ACCOUNT-DENIAL-OF-SERVICE vector. Anyone who knows a victim's
 *      email can lock them out of their own account, repeatedly, forever. IP
 *      keying has no such property: an attacker can only lock out themselves.
 *
 * If account keying is ever added anyway, the rule is absolute: it must return
 * the SAME `invalidCredentials` string, never a distinct one.
 *
 * `tooManyAttempts` is therefore a THIRD branch, reached BEFORE the two that must
 * stay identical, and it does not participate in their equality. Adding it does
 * not split the one key — that invariant is untouched.
 *
 * ONLY FAILURES ARE COUNTED, and success clears the bucket. An office of 300
 * people behind one NAT therefore never accumulates, while brute force — which is
 * by definition a stream of failures — is targeted exactly.
 */

/**
 * The shared shape from `@/lib/validation` (spec 22.2) — it used to be declared
 * here and, separately and identically, in three other feature action files.
 * Kept under this name so the auth forms keep importing their state type from
 * the action they call.
 *
 * ⚠️ An ALIAS DECLARATION, not `export type { FormState }`. In a `"use server"`
 * file the two are not interchangeable: Turbopack's server-actions transform
 * reads the export list from the source, and a type RE-EXPORT survives into it
 * as a runtime action export, failing the build with "Export FormState doesn't
 * exist in target module". `tsc --noEmit` passes either way, so the build is the
 * only thing that catches it. An alias is erased before the transform sees it.
 */
export type FormState = SharedFormState;

/**
 * Is this client currently locked out (spec 2.1)?
 *
 * PEEK, NOT CONSUME — and the order matters more than it looks. The check runs
 * BEFORE the auth adapter is called, because verifying a password is an argon2
 * hash and that CPU cost is precisely what an attacker is trying to spend on our
 * behalf. A limiter that verifies first and counts afterwards has already paid
 * for the attack it then declines. See the `peek` note in the adapter contract.
 */
async function loginBlocked(requestHeaders: Headers): Promise<boolean> {
  if (env.RATE_LIMIT_MODE !== "enforce") return false;
  const decision = await rateLimit.peek(loginRateLimitKey(requestHeaders), LOGIN_RULE);
  return !decision.allowed;
}

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
  // Field-level (§22.2). Safe HERE and not on sign-in: these are FORMAT rules
  // about a password the user just chose and can see, so naming the field
  // discloses nothing they do not already know. `invalid()` also keeps `error`
  // populated, so the whole-form message this used to return is unchanged.
  if (!parsed.success) {
    return invalid(parsed.error, t("generic"));
  }

  const requestHeaders = await headers();

  // Account-creation spam (spec 22.3). Reveals nothing: the bucket is keyed on the
  // client, so this message is identical whether or not the email already exists —
  // the neutral-outcome guarantee below is untouched.
  if (await loginBlocked(requestHeaders)) {
    return { error: t("tooManyAttempts") };
  }

  const result = await authAdapter.signUpEmailPassword(
    { email: parsed.data.email, password: parsed.data.password, name: parsed.data.name },
    requestHeaders,
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

  const requestHeaders = await headers();
  const rateKey = loginRateLimitKey(requestHeaders);

  // §2.1 — before the engine, so a locked-out client costs us no password hash.
  if (await loginBlocked(requestHeaders)) {
    return { error: t("tooManyAttempts") };
  }

  const result = await authAdapter.signInEmailPassword(
    { email: parsed.data.email, password: parsed.data.password },
    requestHeaders,
  );

  if (!result.ok) {
    // Unknown email and wrong password are indistinguishable (spec 2.1). SAME KEY
    // as the parse failure above — see this file's header. One key, three call
    // sites, so no translation can pull them apart.
    if (result.code === "INVALID_CREDENTIALS") {
      // The ONLY branch that counts. Note it is also the only branch that is
      // reachable without knowing the password, which is what makes it the
      // brute-force signal rather than merely the most common failure.
      await rateLimit.consume(rateKey, LOGIN_RULE);
      return { error: t("invalidCredentials") };
    }
    // Suspended/deleted (spec 6.2): only reachable with CORRECT credentials, since
    // the check runs after password verification — so naming the reason enumerates
    // nothing, and a locked-out user otherwise sees "invalid password" forever and
    // files a support ticket we already know the answer to.
    //
    // Deliberately does NOT consume: for that same reason it is not a
    // brute-force signal, and counting it would let a suspended user's own retries
    // throttle everyone sharing their IP.
    if (result.code === "ACCOUNT_SUSPENDED") {
      return { error: t("accountSuspended") };
    }
    return { error: t("generic") };
  }

  // Success clears the bucket (spec 2.1) — this is what keeps a shared office IP
  // from ever accumulating, and it is why only failures are counted.
  await rateLimit.reset(rateKey);

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

  const requestHeaders = await headers();

  /*
   * ⚠️ RATE-LIMITED SILENTLY. This action must keep returning `{ sent: true }` —
   * see this function's header. It is documented as having EXACTLY ONE observable
   * outcome, so a distinguishable "too many attempts" state here would be a new
   * signal on the one form specifically built not to have any, and the easiest
   * oracle in the app to abuse because it needs no password guess.
   *
   * So a blocked client gets the same "we sent you a link" it always gets, and we
   * simply do not send. That also makes this the mail-flood protection §22.4 asks
   * for: the send is the expensive, abusable side effect, and it is what gets
   * skipped.
   */
  const key = loginRateLimitKey(requestHeaders);
  const decision = await rateLimit.consume(key, LOGIN_RULE);
  if (env.RATE_LIMIT_MODE === "enforce" && !decision.allowed) {
    return { sent: true };
  }

  await authAdapter.requestPasswordReset(
    // Same-origin path only; the engine origin-checks it, so this cannot become an
    // open redirect.
    { email: parsed.data.email, redirectTo: "/reset-password" },
    requestHeaders,
  );

  return { sent: true };
}

/**
 * Now the shared shape, because this action DOES return field errors. Kept as a
 * named alias rather than replaced at the call sites: the form reads better
 * importing the state of the action it calls.
 *
 * `ForgotPasswordState` above is deliberately NOT this — it carries `sent` and
 * never reports a field, since reporting anything about the address would make
 * that form the enumeration oracle its header explains it must not be.
 */
export type ResetPasswordState = FormState;

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
  // Same reasoning as sign-up: the password rules are format rules about a value
  // the user just typed. The `token` field also appears in `fieldErrors`, which
  // is harmless — it is a hidden input, so no control renders its message.
  if (!parsed.success) {
    return invalid(parsed.error, t("generic"));
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
