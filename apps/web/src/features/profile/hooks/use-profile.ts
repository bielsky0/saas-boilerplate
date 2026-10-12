"use client";

import { useQuery } from "@tanstack/react-query";

import { browserApi } from "@/lib/query/api-browser";
import { queryKeys } from "@/lib/query/keys";
import type { ProfileUser } from "../types";

interface SessionResponse {
  user: ProfileUser;
}

/**
 * Own profile (etap 4, faza 4) — `GET /v1/session`. The session endpoint
 * answers the full Better Auth session; this hook narrows to the user.
 */
export function useProfile() {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: async () => (await browserApi().get<SessionResponse>("/v1/session")).user,
  });
}
