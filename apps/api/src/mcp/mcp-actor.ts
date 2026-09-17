import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The acting user for one MCP request (spec 26.1, faza 2.7) — the Nest twin
 * of the web app's `features/mcp/actor.ts`.
 *
 * `withMcpAuth` resolves the OAuth access token to a `userId` once, at the
 * controller boundary, and seeds it here. Tools read it back with
 * `getMcpActor()` rather than accepting a user id as an argument: identity
 * comes from the verified token, never from anything the agent can put in a
 * tool call, so an agent cannot act as anyone but the user whose token
 * authenticated the request.
 */

export type McpActor = { userId: string };

const actorStore = new AsyncLocalStorage<McpActor>();

export function runWithMcpActor<T>(userId: string, fn: () => T): T {
  return actorStore.run({ userId }, fn);
}

export function getMcpActor(): McpActor {
  const actor = actorStore.getStore();
  if (!actor) {
    // A tool ran outside the authenticated wrapper — a wiring bug, never a
    // user input. Fail loud rather than fall back to an ambient identity.
    throw new Error("MCP actor is not set — a tool ran outside runWithMcpActor");
  }
  return actor;
}
