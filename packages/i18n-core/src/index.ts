/**
 * Framework-free locale core (spec 16) — no React, no Next.js, no database.
 *
 * `config` holds the locale list, the `Locale` type, cookie/header names and
 * the pure path + negotiation helpers. Both the Next.js web app (proxy,
 * public routes) and the future NestJS API / mobile clients read from here,
 * so "which locales exist" has exactly one answer.
 *
 * React/Next bindings (`navigation`, `request`, messages loading) stay in
 * `apps/web/src/lib/i18n`.
 */
export * from "./config";
