import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";

import { env } from "@/lib/env/server";
import { withTenant } from "@/lib/db/tenant";
import { CLIENT_SESSION_COOKIE, SESSION_REFRESH_THRESHOLD_MS, SESSION_TTL_MS } from "./config";
import {
  deleteSessionByTokenHash,
  findLiveSessionByTokenHash,
  insertClientSession,
  touchSession,
} from "./data";

/**
 * The parent session (langlion §2.19, plan F3 / decyzja D37).
 *
 * Deliberately NOT Better Auth. Staff and parents are different populations with
 * different lifecycles — see `schema/clients.ts` for why parents are a domain
 * entity at all — and one session mechanism serving both would have to blur the
 * boundary this phase exists to draw. `requireClient` is to a parent what
 * `requireOrgPermission` is to a staff member, and nothing in this file grants
 * access to the staff dashboard.
 *
 * ─── WHAT THE COOKIE IS AND IS NOT ──────────────────────────────────────────
 *
 * It is an opaque 256-bit random token, and nothing else. It carries no client
 * id, no organization id, and no signature, because it makes no claim: the ROW
 * holds the facts and the token is only a lookup key. The practical consequence
 * is that revocation works — deleting the row ends the session immediately, which
 * a self-describing signed cookie could not offer before its own expiry.
 *
 * Only the SHA-256 is stored, like `invitation.tokenHash`. A database leak yields
 * hashes, not usable sessions.
 *
 * ─── ONE COOKIE NAME, NOT ONE PER ORGANIZATION ──────────────────────────────
 *
 * The name is fixed and the organization lives on the row. That keeps the cookie
 * contract identical before and after the subdomain middleware (F5), where
 * per-host scoping arrives on its own and this file does not change.
 *
 * The cost, until then: on a shared host, signing in to Academy B overwrites the
 * cookie for Academy A, so one browser holds one academy at a time. That is a dev
 * and E2E wrinkle rather than a production one — under real subdomains the two
 * cookies are separate by host — and it is not an isolation hole either way,
 * because `resolveClientSession` looks the token up inside the served tenant and
 * a foreign cookie finds no row.
 */

export interface ClientPrincipal {
  clientId: string;
  organizationId: string;
  email: string;
  name: string | null;
  isVerified: boolean;
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Start a session and set the cookie. Route Handlers and Server Functions only —
 * `cookies().set` is unavailable during Server Component rendering.
 */
export async function createClientSession(organizationId: string, clientId: string): Promise<void> {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await withTenant(organizationId, (tx) =>
    insertClientSession(tx, {
      organizationId,
      clientId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    }),
  );

  (await cookies()).set(CLIENT_SESSION_COOKIE, rawToken, {
    path: "/",
    expires: expiresAt,
    // No client JS has any reason to read this, and every reason not to be able to.
    httpOnly: true,
    // `lax`, not `strict`: a parent following a link from the academy's own
    // confirmation email must land already signed in, and `strict` would drop the
    // cookie on that first cross-site navigation. The value is not a bearer of any
    // state-changing GET, so the CSRF surface `strict` would buy is not open here.
    sameSite: "lax",
    // Plain HTTP in local dev would otherwise never receive the cookie at all.
    secure: env.NODE_ENV === "production",
  });
}

/**
 * Resolve the current parent for the academy being served, or null.
 *
 * `organizationId` is a REQUIRED argument rather than something inferred, and the
 * lookup is scoped by it. A caller cannot accidentally ask "who is signed in"
 * without saying where — which is the question that has no safe answer in a
 * multi-tenant app.
 *
 * Refreshes the expiry past the threshold, so an active parent is not signed out
 * mid-term. Below the threshold this is a pure read.
 */
export async function resolveClientSession(
  organizationId: string,
): Promise<ClientPrincipal | null> {
  const rawToken = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);

  return withTenant(organizationId, async (tx) => {
    const row = await findLiveSessionByTokenHash(tx, organizationId, tokenHash);
    if (!row) return null;

    if (Date.now() - row.lastUsedAt.getTime() > SESSION_REFRESH_THRESHOLD_MS) {
      await touchSession(tx, organizationId, row.sessionId, new Date(Date.now() + SESSION_TTL_MS));
    }

    return {
      clientId: row.clientId,
      organizationId,
      email: row.email,
      name: row.name,
      isVerified: row.isVerified,
    };
  });
}

/**
 * The gate for anything a signed-in parent may do.
 *
 * Throws rather than returning null so a caller cannot proceed by ignoring the
 * result — the same stance `requireSession` takes for staff. Callers that want
 * the soft answer use `resolveClientSession` directly.
 */
export class ClientAuthRequiredError extends Error {
  constructor() {
    super("Client authentication required");
    this.name = "ClientAuthRequiredError";
  }
}

export async function requireClient(organizationId: string): Promise<ClientPrincipal> {
  const principal = await resolveClientSession(organizationId);
  if (!principal) throw new ClientAuthRequiredError();
  return principal;
}

/**
 * End the session: delete the row, then clear the cookie.
 *
 * THE ORDER MATTERS. Clearing the cookie first would leave a live row reachable
 * by anyone who kept a copy of the token, and the user would have been told they
 * logged out. Deleting first means the worst case is a stale cookie that resolves
 * to nothing.
 */
export async function destroyClientSession(organizationId: string): Promise<void> {
  const store = await cookies();
  const rawToken = store.get(CLIENT_SESSION_COOKIE)?.value;

  if (rawToken) {
    await withTenant(organizationId, (tx) =>
      deleteSessionByTokenHash(tx, organizationId, hashToken(rawToken)),
    );
  }

  store.delete(CLIENT_SESSION_COOKIE);
}
