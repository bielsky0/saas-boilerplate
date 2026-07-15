/**
 * RBAC feature module (spec 4 — role-based access control).
 *
 * Centralized role → permissions map (Owner / Admin / Member, extensible to
 * custom roles) and the helpers that enforce atomic permissions. Backend
 * enforcement is the single source of truth (spec 4.2): every data-changing
 * server action checks permission in the active-organization context and
 * returns 403 otherwise. UI hiding/disabling is cosmetic only.
 */

export {};
