import type { AdminErrorCode } from "@repo/contracts/admin";
import { clientEnv } from "@/lib/env/client";

/**
 * Browser client for the NestJS super-admin API (faza 2.6 — spec 6).
 *
 * Mutations WITHOUT a cookie swap (suspend, unsuspend, delete, set-role) call
 * Nest DIRECTLY (`credentials: "include"`, CORS) — the same shape as
 * `features/organizations/client.ts`. The API answers CODES, never prose;
 * each calling component maps one code to one message.
 *
 * The two cookie-swapping mutations (impersonate, stop) do NOT live here:
 * they go through the same-origin web relay (`POST /api/admin/impersonate*`),
 * which copies the engine's `Set-Cookie` onto a first-party response. A
 * direct browser→Nest call would set a third-party cookie, which
 * cross-origin deployments (Vercel web + VPS API) cannot rely on.
 */

export type AdminCode = AdminErrorCode | "RATE_LIMITED" | "UNKNOWN";

export interface AdminOk<T> {
  ok: true;
  data: T;
}

export interface AdminFail {
  ok: false;
  code: AdminCode;
  fieldErrors?: Record<string, string[]>;
}

export type AdminResult<T> = AdminOk<T> | AdminFail;

const KNOWN_CODES: ReadonlySet<string> = new Set([
  "USER_NOT_FOUND",
  "ORGANIZATION_NOT_FOUND",
  "IMPERSONATION_FORBIDDEN",
  "NOT_IMPERSONATING",
  "TARGET_IS_ADMIN",
  "CANNOT_ACT_ON_SELF",
  "ALREADY_DELETED",
  "ALREADY_ADMIN",
  "NOT_ADMIN",
  "LAST_ADMIN",
]);

function apiBase(): string {
  return clientEnv.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
}

function codeFromStatus(status: number, payload: Record<string, unknown>): AdminCode {
  if (status === 429) return "RATE_LIMITED";
  const error = payload["error"];
  if (typeof error === "string" && KNOWN_CODES.has(error)) return error as AdminCode;
  return "UNKNOWN";
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<AdminResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Nest unreachable — indistinguishable from a generic failure to the user.
    return { ok: false, code: "UNKNOWN" };
  }

  if (res.status === 204) return { ok: true, data: undefined as T };

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }

  if (res.ok) return { ok: true, data: payload as T };

  const record = (payload ?? {}) as Record<string, unknown>;
  const issues = record["issues"];
  return {
    ok: false,
    code: codeFromStatus(res.status, record),
    ...(issues && typeof issues === "object"
      ? { fieldErrors: issues as Record<string, string[]> }
      : {}),
  };
}

export function suspendUser(userId: string, reason?: string): Promise<AdminResult<{ ok: true }>> {
  return request("POST", `/v1/admin/users/${encodeURIComponent(userId)}/suspend`, {
    ...(reason ? { reason } : {}),
  });
}

export function unsuspendUser(userId: string): Promise<AdminResult<{ ok: true }>> {
  return request("POST", `/v1/admin/users/${encodeURIComponent(userId)}/unsuspend`);
}

export function deleteUser(userId: string): Promise<AdminResult<{ ok: true }>> {
  return request("POST", `/v1/admin/users/${encodeURIComponent(userId)}/delete`);
}

export function deleteOrganization(orgId: string): Promise<AdminResult<{ ok: true }>> {
  return request("POST", `/v1/admin/organizations/${encodeURIComponent(orgId)}/delete`);
}

export function setSuperAdmin(
  userId: string,
  value: "grant" | "revoke",
): Promise<AdminResult<{ ok: true }>> {
  return request("POST", `/v1/admin/users/${encodeURIComponent(userId)}/super-admin`, { value });
}

/**
 * Start impersonating through the same-origin relay (see the module header).
 * On success the response already carried the swapped session cookie — the
 * caller navigates to `/dashboard`, never re-reading the session first
 * (stale-cookie, like the old server action's redirect).
 */
export async function impersonateViaWeb(
  userId: string,
  reason: string,
): Promise<AdminResult<{ ok: true }>> {
  let res: Response;
  try {
    res = await fetch("/api/admin/impersonate", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, reason }),
    });
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }
  if (res.ok) return { ok: true, data: payload as { ok: true } };
  const record = (payload ?? {}) as Record<string, unknown>;
  const issues = record["issues"];
  return {
    ok: false,
    code: codeFromStatus(res.status, record),
    ...(issues && typeof issues === "object"
      ? { fieldErrors: issues as Record<string, string[]> }
      : {}),
  };
}

/**
 * Leave admin mode through the same-origin relay. `signedOut` is true when
 * the admin's own session expired mid-impersonation and the API fell back to
 * a plain sign-out — the caller then lands on `/login`, not `/dashboard`.
 */
export async function stopImpersonatingViaWeb(): Promise<
  AdminResult<{ ok: true; signedOut: boolean }>
> {
  let res: Response;
  try {
    res = await fetch("/api/admin/impersonate/stop", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, code: "UNKNOWN" };
  }
  if (res.ok) return { ok: true, data: payload as { ok: true; signedOut: boolean } };
  return { ok: false, code: "UNKNOWN" };
}
