import { and, eq, isNull } from "drizzle-orm";

import { withSystemBypass } from "@/lib/db/system";
import { invitation, membership, organization } from "@/lib/db/schema";
import type { OrgSummary } from "./data";

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
 * The orgs a user actively belongs to (for the account switcher). Personal
 * context is derived separately from the user record, not returned here.
 *
 * BYPASS: the question is "which tenants does this person belong to", so no
 * single tenant can be named before asking it — naming one would presuppose the
 * answer. Scoped by `userId`, which is the caller's own session user.
 */
export async function listUserOrgs(userId: string): Promise<OrgSummary[]> {
  return withSystemBypass("account switcher — lists every org a user belongs to", (tx) =>
    tx
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
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
