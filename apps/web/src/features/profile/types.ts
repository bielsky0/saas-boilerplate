/**
 * Profile DTO mirrors (etap 4, faza 4).
 *
 * Source of truth: `GET /v1/session` (Better Auth session) for reads,
 * `PATCH /v1/profile` (`apps/api/src/auth/auth.service.ts`) for writes.
 */
export interface ProfileUser {
  id: string;
  name: string | null;
  email: string;
  emailVerified: boolean;
}

export interface ProfileUpdate {
  ok: true;
  name: string;
}
