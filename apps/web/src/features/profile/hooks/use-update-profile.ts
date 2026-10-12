"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { browserApi } from "@/lib/query/api-browser";
import { queryKeys } from "@/lib/query/keys";
import type { ProfileNameInput } from "../schema";
import type { ProfileUpdate } from "../types";

/**
 * Display-name update — `PATCH /v1/profile`. Success invalidates `profile`
 * (header menu + switcher re-read the session); the caller maps `ApiError`
 * issues onto the form (see `ProfileForm`).
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileNameInput) =>
      browserApi().patch<ProfileUpdate>("/v1/profile", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}
