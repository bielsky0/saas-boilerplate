/**
 * Super-admin feature module (spec 6 — system administration).
 *
 * Gated by a system-level `isSuperAdmin` flag (independent of org roles) behind
 * a dedicated middleware. Provides global user/organization listings, account
 * suspension, impersonation (banner + audit-logged), and account deletion
 * (with soft-delete/retention). Critical admin actions are written to the
 * audit log (spec 6.3).
 */

export {};
