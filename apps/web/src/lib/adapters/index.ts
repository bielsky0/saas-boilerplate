/**
 * Provider adapters (spec 1.2 — no vendor lock-in).
 *
 * Every external integration (auth, billing, email, jobs, storage) is hidden
 * behind an internal contract defined in its subfolder. The rest of the app
 * depends on the interface, never on a vendor SDK, so swapping a provider means
 * replacing one adapter and nothing else.
 */

export {};
