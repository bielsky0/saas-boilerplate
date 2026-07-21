import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";

import { withSystemBypass } from "@/lib/db/system";
import { invitation, membership, organization, staffSessionHandoff } from "@/lib/db/schema";
import type { OrgSummary } from "./data";

/**
 * SHA-256 of a raw handoff token (plan Faza 5.5, decyzja D74) — kept here,
 * not in `./actions.ts`, because every exported value in a `"use server"`
 * module must be an async Server Action, and this needs to be callable from a
 * plain Server Component (the apex directory) as a synchronous pure function.
 * `./actions.ts` mints the token and hashes it with this same function before
 * the insert, so the two sides never disagree on the hash.
 */
export function hashHandoffToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * The organization reads that cannot be scoped to one tenant (spec §1.3, F1a).
 *
 * `membership` and `invitation` are under Row-Level Security, and almost every
 * query against them names its organization first — those live in `./data.ts`
 * and take a `TenantDb`. These three cannot, for a reason that is structural
 * rather than inconvenient, so they are gathered here behind the documented
 * bypass and this module is the one added to the `no-restricted-imports`
 * allow-list in `eslint.config.mjs`.
 *
 * WHY A SEPARATE FILE RATHER THAN AN EXEMPTION ON `data.ts`. The fence's job is
 * to keep bypass access away from `getMembership` and `listMembers` — the two
 * functions that decide what a caller may see. Exempting the module both of them
 * live in, and which every feature imports, would hand the escape hatch to
 * exactly the code it exists to constrain. The repo's established unit of
 * carve-out is a file (`features/admin/data.ts`); this follows it.
 *
 * Each function below justifies its own bypass. Do not add a fourth without one.
 */

/**
 * The academies a user actively belongs to. Personal context is derived
 * separately from the user record, not returned here.
 *
 * Feeds the apex directory that REPLACED the account switcher in F4.6 (§2.19
 * exception #5). The difference is not cosmetic: a switcher changed the active
 * tenant inside one session, whereas each row here is a separate origin that
 * requires its own sign-in. Hence `subdomain` in the projection — the link needs
 * a host, not a path.
 *
 * BYPASS: the question is "which tenants does this person belong to", so no
 * single tenant can be named before asking it — naming one would presuppose the
 * answer. Scoped by `userId`, which is the caller's own session user.
 */
export async function listUserOrgs(userId: string): Promise<OrgSummary[]> {
  return withSystemBypass("academy directory — lists every org a user belongs to", (tx) =>
    tx
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        subdomain: organization.subdomain,
        role: membership.role,
      })
      .from(membership)
      .innerJoin(organization, eq(membership.organizationId, organization.id))
      .where(
        and(
          eq(membership.userId, userId),
          eq(membership.status, "active"),
          isNull(organization.deletedAt),
        ),
      )
      .orderBy(organization.name),
  );
}

/**
 * Look up an invitation by the SHA-256 of its raw token.
 *
 * BYPASS: an invitation is redeemed by someone who is not yet a member, from a
 * link that carries only the token — the organization is the OUTPUT of this
 * query, not an input to it. The token hash is the access boundary, and it is
 * single-use and expiring (see `schema/invitations.ts`).
 *
 * Callers that go on to write must re-enter tenant context with the resolved
 * `organizationId`, so the policy stays load-bearing on the write path — see
 * `acceptInvitationAction` in `./actions.ts`.
 */
export async function getInvitationByTokenHash(tokenHash: string) {
  return withSystemBypass(
    "invitation redemption — org unknown until the token resolves",
    async (tx) => {
      const [row] = await tx
        .select()
        .from(invitation)
        .where(eq(invitation.tokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    },
  );
}

/**
 * Look up an invitation and whether it is currently redeemable (pending and not
 * expired). The time check lives here rather than in a React render so the page
 * stays pure.
 */
export async function getInvitationWithValidity(tokenHash: string) {
  const invite = await getInvitationByTokenHash(tokenHash);
  const valid =
    invite !== null && invite.status === "pending" && invite.expiresAt.getTime() >= Date.now();
  return { invite, valid };
}

/**
 * Which organization a handoff token points at, WITHOUT consuming it (plan
 * Faza 5.5, decyzja D74).
 *
 * A read, not the atomic redemption below — used only by the apex directory
 * page to decide which ONE academy's link gets `?handoff=` appended. It cannot
 * create a session and cannot be raced into doing so; the actual redemption
 * happens once, on the tenant host, via `consumeStaffSessionHandoff`.
 *
 * BYPASS: same reason as every other function in this file — the organization
 * is the output of the token, not an input.
 */
export async function peekHandoffOrganizationId(tokenHash: string): Promise<string | null> {
  return withSystemBypass("staff session handoff — directory link targeting", async (tx) => {
    const [row] = await tx
      .select({ organizationId: staffSessionHandoff.organizationId })
      .from(staffSessionHandoff)
      .where(
        and(
          eq(staffSessionHandoff.tokenHash, tokenHash),
          isNull(staffSessionHandoff.consumedAt),
          gt(staffSessionHandoff.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return row?.organizationId ?? null;
  });
}

/**
 * Redeem a staff session handoff token — ATOMICALLY (plan Faza 5.5, decyzja
 * D74, following decyzja D38's shape for `consumeOtp`).
 *
 * BYPASS: which organization/user this token belongs to is the OUTPUT of this
 * lookup, exactly like `getInvitationByTokenHash` above — nothing can be named
 * before the hash resolves.
 *
 * ⚠️ DO NOT REFACTOR INTO A SELECT AND AN UPDATE. Every condition that makes a
 * token redeemable — right hash, not already consumed, not expired — is in the
 * WHERE clause, so Postgres marks the row consumed in one indivisible step.
 * Exactly one of two concurrent requests carrying the same token (e.g. a
 * browser prefetch racing the real click) can match an un-consumed row; the
 * loser gets `null` back and must not create a second session.
 *
 * A `null` return does not distinguish "wrong", "expired" and "already
 * consumed" — the caller's fallback (a plain login screen) is identical for
 * all three, so there is nothing a distinction would buy.
 */
export async function consumeStaffSessionHandoff(
  tokenHash: string,
): Promise<{ organizationId: string; userId: string } | null> {
  return withSystemBypass(
    "staff session handoff — org/user unknown until the token resolves",
    async (tx) => {
      const [row] = await tx
        .update(staffSessionHandoff)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(staffSessionHandoff.tokenHash, tokenHash),
            isNull(staffSessionHandoff.consumedAt),
            gt(staffSessionHandoff.expiresAt, new Date()),
          ),
        )
        .returning({
          organizationId: staffSessionHandoff.organizationId,
          userId: staffSessionHandoff.userId,
        });
      return row ?? null;
    },
  );
}
