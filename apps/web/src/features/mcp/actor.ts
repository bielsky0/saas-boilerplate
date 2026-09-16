import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The acting user for one MCP request (spec 26.1).
 *
 * `withMcpAuth` resolves the OAuth access token to a `userId` once, at the route
 * boundary, and seeds it here — exactly the shape `runWithLogContext` uses for
 * jobs in `src/lib/logger.ts`. Tools read it back with `getMcpActor()` rather than
 * accepting a user id as an argument: identity comes from the verified token, never
 * from anything the agent can put in a tool call, so an agent cannot act as anyone
 * but the user whose token authenticated the request.
 *
 * THIS IS ALSO THE AUDIT ACTOR (spec 26.1 → 6.4). When write tools arrive, the
 * `userId` here is what a write's audit entry attributes to, via
 * `mcpActor(userId, email)` in `features/admin/audit.ts` — same user, same
 * permissions, `actorType: "AIAgent"` as the only distinguishing fact. Note this
 * type carries no email: a write tool has to resolve one for the entry's
 * `actorEmail` snapshot. Widening `McpActor` to carry it is a reasonable change at
 * that point; it is not done pre-emptively because nothing needs it yet, and an
 * unused field on the identity that gates every tool call is the wrong thing to
 * add speculatively.
 */
export type McpActor = { userId: string };

const actorStore = new AsyncLocalStorage<McpActor>();

export function runWithMcpActor<T>(userId: string, fn: () => T): T {
  return actorStore.run({ userId }, fn);
}

export function getMcpActor(): McpActor {
  const actor = actorStore.getStore();
  if (!actor) {
    // A tool ran outside the authenticated wrapper — a wiring bug, never a user
    // input. Fail loud rather than fall back to an ambient identity.
    throw new Error("MCP actor is not set — a tool ran outside runWithMcpActor");
  }
  return actor;
}
