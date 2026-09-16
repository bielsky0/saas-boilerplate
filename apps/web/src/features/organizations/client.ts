import { clientEnv } from "@/lib/env/client";
import { LOCALE_HEADER, type Locale } from "@/lib/i18n/config";

/**
 * Browser client for the NestJS organizations API (faza 2.2 — spec 3).
 *
 * The forms call Nest DIRECTLY (`credentials: "include"`, CORS), so no
 * server-action relay sits in between — the same shape as `features/auth/
 * client.ts`. The API answers CODES, never prose; each calling component maps
 * one code to one `organizations.errors.*` key, which keeps the §3.3
 * anti-enumeration guarantee structural on the client too.
 */

export type OrgCode =
  "LAST_OWNER" | "SLUG_TAKEN" | "INVALID_TOKEN" | "NOT_FOUND" | "RATE_LIMITED" | "UNKNOWN";

export interface OrgOk<T> {
  ok: true;
  data: T;
}

export interface OrgFail {
  ok: false;
  code: OrgCode;
  fieldErrors?: Record<string, string[]>;
}

export type OrgResult<T> = OrgOk<T> | OrgFail;

export interface OrgDTO {
  id: string;
  name: string;
  slug: string;
}

export interface MemberDTO {
  id: string;
  role: string;
}

export interface InvitationDTO {
  id: string;
  email: string;
  role: string;
  status: string;
}

function apiBase(): string {
  return clientEnv.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
}

function codeFromStatus(status: number, payload: Record<string, unknown>): OrgCode {
  if (status === 429) return "RATE_LIMITED";
  if (status === 404) return "NOT_FOUND";
  const error = payload["error"];
  if (error === "LAST_OWNER" || error === "SLUG_TAKEN" || error === "INVALID_TOKEN") {
    return error;
  }
  return "UNKNOWN";
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  locale?: Locale,
): Promise<OrgResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(locale ? { [LOCALE_HEADER]: locale } : {}),
      },
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

export function createOrganization(
  input: { name: string; slug?: string },
  locale?: Locale,
): Promise<OrgResult<OrgDTO>> {
  return request("POST", "/v1/organizations", input, locale);
}

export function updateOrganization(
  slug: string,
  input: { name?: string; newSlug?: string },
  locale?: Locale,
): Promise<OrgResult<OrgDTO>> {
  return request("PATCH", `/v1/organizations/${encodeURIComponent(slug)}`, input, locale);
}

export function deleteOrganization(slug: string): Promise<OrgResult<never>> {
  return request("DELETE", `/v1/organizations/${encodeURIComponent(slug)}`);
}

export function updateMemberRole(
  slug: string,
  memberId: string,
  role: string,
): Promise<OrgResult<MemberDTO>> {
  return request(
    "PATCH",
    `/v1/organizations/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}`,
    { role },
  );
}

export function removeMember(slug: string, memberId: string): Promise<OrgResult<never>> {
  return request(
    "DELETE",
    `/v1/organizations/${encodeURIComponent(slug)}/members/${encodeURIComponent(memberId)}`,
  );
}

export function leaveOrganization(slug: string): Promise<OrgResult<never>> {
  return request("DELETE", `/v1/organizations/${encodeURIComponent(slug)}/membership`);
}

export function createInvitation(
  slug: string,
  input: { email: string; role: string },
  locale?: Locale,
): Promise<OrgResult<InvitationDTO>> {
  return request(
    "POST",
    `/v1/organizations/${encodeURIComponent(slug)}/invitations`,
    input,
    locale,
  );
}

export function revokeInvitation(slug: string, invitationId: string): Promise<OrgResult<never>> {
  return request(
    "DELETE",
    `/v1/organizations/${encodeURIComponent(slug)}/invitations/${encodeURIComponent(invitationId)}`,
  );
}

export function acceptInvitation(token: string): Promise<OrgResult<{ slug: string }>> {
  return request("POST", `/v1/invitations/${encodeURIComponent(token)}/accept`);
}
