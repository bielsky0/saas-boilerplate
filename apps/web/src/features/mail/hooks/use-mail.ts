"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { browserApi } from "@/lib/query/api-browser";
import { queryKeys } from "@/lib/query/keys";
import type {
  MailCounts,
  MailFolder,
  MailLabel,
  MailThreadDetail,
  MailThreadsPage,
  MailThreadsQuery,
} from "../mail-types";

/**
 * Mail reads/writes (etap 5, faza 5.4).
 *
 * Every thread query is keyed by its folder/label/search/unread params, so
 * switching mailbox refetches exactly that list. Mutations invalidate the whole
 * `mail` subtree: a flag change moves rows between folders and shifts counts, so
 * key-scoped invalidation would leave a stale nav behind.
 */

function toParams(query: MailThreadsQuery): Record<string, string | number | undefined> {
  return {
    folder: query.folder,
    label: query.label,
    q: query.q || undefined,
    unread: query.unread ? "1" : undefined,
    limit: query.limit,
  };
}

export function useMailThreads(query: MailThreadsQuery) {
  const params = toParams(query);
  return useQuery({
    queryKey: queryKeys.mail.threads({
      folder: params.folder ?? "",
      label: params.label ?? "",
      q: params.q ?? "",
      unread: params.unread ?? "",
    }),
    queryFn: () => browserApi().get<MailThreadsPage>("/v1/mail/threads", { query: params }),
  });
}

export function useMailCounts() {
  return useQuery({
    queryKey: queryKeys.mail.counts,
    queryFn: () => browserApi().get<MailCounts>("/v1/mail/counts"),
  });
}

export function useMailThread(id: string | null) {
  return useQuery({
    queryKey: queryKeys.mail.thread(id ?? ""),
    enabled: Boolean(id),
    queryFn: () =>
      browserApi().get<MailThreadDetail>(`/v1/mail/threads/${encodeURIComponent(id!)}`),
  });
}

function useInvalidateMail() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.mail.all });
}

export interface SendMailInput {
  to: string[];
  subject: string;
  body: string;
  draft?: boolean;
}

export function useSendMail() {
  const invalidate = useInvalidateMail();
  return useMutation({
    mutationFn: (input: SendMailInput) =>
      browserApi().post<{ id: string }>("/v1/mail/threads", input),
    onSuccess: invalidate,
  });
}

export function useReply() {
  const invalidate = useInvalidateMail();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      browserApi().post<{ id: string }>(`/v1/mail/threads/${encodeURIComponent(id)}/messages`, {
        body,
      }),
    onSuccess: invalidate,
  });
}

export interface UpdateThreadInput {
  folder?: MailFolder;
  isRead?: boolean;
  isStarred?: boolean;
  labels?: MailLabel[];
}

export function useUpdateThread() {
  const invalidate = useInvalidateMail();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateThreadInput }) =>
      browserApi().patch<{ ok: true }>(`/v1/mail/threads/${encodeURIComponent(id)}`, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteThread() {
  const invalidate = useInvalidateMail();
  return useMutation({
    mutationFn: (id: string) =>
      browserApi().del<{ ok: true }>(`/v1/mail/threads/${encodeURIComponent(id)}`),
    onSuccess: invalidate,
  });
}
