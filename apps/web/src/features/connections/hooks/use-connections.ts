"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { browserApi } from "@/lib/query/api-browser";
import { queryKeys } from "@/lib/query/keys";

/**
 * User connections (etap 5, faza 5.2) — profile "connections" backing.
 * `GET /v1/connections` (own rows only), `POST` (neutral for unknown emails —
 * anti-enumeration, like invitations), `DELETE` (own rows only).
 */

export interface UserConnection {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export function useConnections() {
  return useQuery({
    queryKey: queryKeys.connections.all,
    queryFn: () => browserApi().get<{ items: UserConnection[] }>("/v1/connections"),
  });
}

export function useToggleConnection() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.connections.all });
  const connect = useMutation({
    mutationFn: (email: string) =>
      browserApi().post<{ ok: true; connected: boolean }>("/v1/connections", { email }),
    onSuccess: invalidate,
  });
  const disconnect = useMutation({
    mutationFn: (id: string) => browserApi().del<{ ok: true }>(`/v1/connections/${id}`),
    onSuccess: invalidate,
  });
  return { connect, disconnect };
}
