import { clientEnv } from "@/lib/env/client";
import { isLocale, LOCALE_HEADER, type Locale } from "@/lib/i18n/config";

/**
 * Browser client for the NestJS auth API (faza 2.1 — spec 2).
 *
 * The forms call Nest DIRECTLY (`credentials: "include"`, CORS), so the
 * session cookie is set by the API response — no server-action relay. The API
 * answers CODES, never prose; the calling component renders the single
 * `auth.errors.*` key for each code, which is what keeps the §2.1
 * anti-enumeration guarantee structural on the client too (one key per
 * outcome, never two strings to pull apart).
 */

export type AuthCode =
  | "INVALID_CREDENTIALS"
  | "WEAK_PASSWORD"
  | "INVALID_TOKEN"
  | "ACCOUNT_SUSPENDED"
  | "RATE_LIMITED"
  | "UNKNOWN";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface ForgotFormState {
  error?: string;
  sent?: boolean;
}

function apiBase(): string {
  return clientEnv.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
}

/** Only same-origin relative paths are accepted (no open redirect). */
export function safeCallbackUrl(raw: string | null | undefined): string {
  const value = typeof raw === "string" ? raw : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function verifySentUrl(callbackUrl: string): string {
  return callbackUrl === "/dashboard"
    ? "/verify-email?status=sent"
    : `/verify-email?status=sent&callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

interface FetchOptions {
  locale?: Locale;
}

async function postForm(
  path: string,
  body: Record<string, unknown>,
  options?: FetchOptions,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; code: AuthCode; fieldErrors?: Record<string, string[]> }
> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(options?.locale ? { [LOCALE_HEADER]: options.locale } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Nest unreachable — indistinguishable from a generic failure to the user.
    return { ok: false, code: "UNKNOWN" };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }

  if (res.ok) return { ok: true, data: payload };

  const record = (payload ?? {}) as Record<string, unknown>;

  if (res.status === 429) return { ok: false, code: "RATE_LIMITED" };
  if (typeof record["code"] === "string") {
    return { ok: false, code: record["code"] as AuthCode };
  }
  // 422 backstop (spec 22.2 envelope `{ error, issues? }`): surface the
  // per-field detail the way the old server actions did.
  const issues = record["issues"];
  if (issues && typeof issues === "object") {
    return { ok: false, code: "UNKNOWN", fieldErrors: issues as Record<string, string[]> };
  }
  return { ok: false, code: "UNKNOWN" };
}

export interface SignUpInput {
  email: string;
  password: string;
  name?: string;
  locale: Locale;
}

export function signUpWithNest(input: SignUpInput) {
  return postForm(
    "/v1/auth/sign-up",
    { email: input.email, password: input.password, ...(input.name ? { name: input.name } : {}) },
    { locale: input.locale },
  );
}

export function signInWithNest(input: { email: string; password: string }) {
  return postForm("/v1/auth/sign-in", input);
}

/**
 * The stored language from a successful sign-in, or null. Narrowed, never
 * trusted blindly: a foreign backend (or a stale deploy) could send anything,
 * and a fabricated preference would then outrank the browser forever.
 */
export function signInLocale(result: { ok: true; data: unknown }): Locale | null {
  const locale = (result.data as { locale?: unknown } | null)?.locale;
  return isLocale(locale) ? locale : null;
}

export function requestResetWithNest(input: { email: string }) {
  return postForm("/v1/auth/password-reset/request", input);
}

export function confirmResetWithNest(input: { token: string; newPassword: string }) {
  return postForm("/v1/auth/password-reset/confirm", input);
}

export function signOutFromNest() {
  return postForm("/v1/auth/sign-out", {});
}
