/**
 * Provider contracts (spec 1.2 — no vendor lock-in).
 *
 * Feature/UI code depends ONLY on these interfaces and their DTO/error types —
 * never on a provider SDK. Each adapter's concrete implementation lives with
 * its app (`apps/web` today, `apps/api` tomorrow); swapping a provider means
 * implementing one contract, not touching callers.
 */
export * from "./auth";
export * from "./billing";
export * from "./email";
export * from "./jobs";
export * from "./storage";
export * from "./rate-limit";
