/**
 * Server-side auth & authorization helpers (spec 2.5, 4.2).
 *
 * The data-layer counterpart to the `features/auth` UI: resolve the current
 * session/user, the active tenant context, and enforce RBAC permissions on the
 * server before any data-changing operation. This is where authorization lives
 * — NOT in UI components. Consumes the auth adapter in `src/lib/adapters/auth`.
 */

export {};
