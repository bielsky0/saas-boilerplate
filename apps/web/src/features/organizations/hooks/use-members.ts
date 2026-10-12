"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { browserApi } from "@/lib/query/api-browser";
import { queryKeys } from "@/lib/query/keys";
import {
  createInvitation,
  removeMember,
  revokeInvitation,
  updateMemberRole,
  type OrgResult,
} from "../../organizations/client";
import type { Locale } from "@/lib/i18n/config";

/**
 * Org members through TanStack Query (etap 4, faza 4).
 *
 * Reads: `GET /v1/organizations/:slug/members` (member-scoped read, newest
 * first — small lists, so the table filters/sorts/paginates client-side).
 * Writes reuse the existing `features/organizations/client.ts` transports
 * 1:1 (same endpoints, same `{ok, code}` envelope, same permission guards
 * server-side) — only the refresh mechanism changes from `router.refresh()`
 * to query invalidation.
 */

export interface OrgMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  createdAt: string;
}

export interface OrgInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
}

export function membersKey(slug: string) {
  return ["members", slug] as const;
}

export function useMembers(slug: string) {
  return useQuery({
    queryKey: membersKey(slug),
    queryFn: () =>
      browserApi().get<{ items: OrgMember[] }>(
        `/v1/organizations/${encodeURIComponent(slug)}/members`,
      ),
  });
}

export function useInvitations(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: [...membersKey(slug), "invitations"] as const,
    queryFn: () =>
      browserApi().get<{ items: OrgInvitation[] }>(
        `/v1/organizations/${encodeURIComponent(slug)}/invitations`,
      ),
    enabled,
  });
}

function useInvalidateMembers(slug: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: membersKey(slug) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
  };
}

export function useUpdateMemberRole(slug: string) {
  const invalidate = useInvalidateMembers(slug);
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      updateMemberRole(slug, memberId, role),
    onSuccess: (result: OrgResult<unknown>) => {
      if (result.ok) invalidate();
    },
  });
}

export function useRemoveMember(slug: string) {
  const invalidate = useInvalidateMembers(slug);
  return useMutation({
    mutationFn: (memberId: string) => removeMember(slug, memberId),
    onSuccess: (result: OrgResult<never>) => {
      if (result.ok) invalidate();
    },
  });
}

export function useInviteMember(slug: string) {
  const invalidate = useInvalidateMembers(slug);
  return useMutation({
    mutationFn: (input: { email: string; role: string; locale?: Locale }) =>
      createInvitation(slug, { email: input.email, role: input.role }, input.locale),
    onSuccess: (result: OrgResult<unknown>) => {
      if (result.ok) invalidate();
    },
  });
}

export function useRevokeInvitation(slug: string) {
  const invalidate = useInvalidateMembers(slug);
  return useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(slug, invitationId),
    onSuccess: (result: OrgResult<never>) => {
      if (result.ok) invalidate();
    },
  });
}
