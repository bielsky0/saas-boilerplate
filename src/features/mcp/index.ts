/**
 * MCP feature barrel (spec 26 — AI Agent).
 *
 * Types only, per the repo convention (see `features/notifications/index.ts`).
 * Every runtime module here is SERVER-ONLY — `actor.ts` (Node AsyncLocalStorage),
 * `context.ts` and `tools.ts` (data-layer reads) — so the `/api/mcp` route imports
 * them by path rather than through this barrel, keeping them out of any client
 * bundle. There are no client components in this module.
 */

export type { McpActor } from "./actor";
export type { McpOrgAccess, McpOwner } from "./context";
