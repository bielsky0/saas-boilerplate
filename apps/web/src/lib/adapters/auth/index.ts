/**
 * Auth contract re-export (spec 1.2, 2).
 *
 * Faza 2.8: the Better Auth ENGINE moved to Nest (`apps/api/src/auth` — the
 * session lives there, minted and verified). What stays here is the SESSION
 * VOCABULARY server code reads (`Session`, `SessionUser` in `src/lib/auth`,
 * `features/admin/context`, `features/organizations/context`): `import type`
 * is erased at compile, so these modules carry no runtime auth dependency.
 * The source of truth is `@repo/contracts/auth` — this barrel exists only so
 * existing `import type … from "@/lib/adapters/auth"` lines keep resolving.
 */

export type {
  AuthAdapter,
  AuthErrorCode,
  AuthResult,
  Session,
  SessionUser,
  SignInInput,
  SignUpInput,
} from "@repo/contracts/auth";
