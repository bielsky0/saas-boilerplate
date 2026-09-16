import { requireSession } from "@/lib/auth";
import { requireOrgPermission } from "@/features/organizations/context";
import { ensurePersonalAccount, getPersonalAccountByUserId } from "@/features/organizations/data";

/**
 * Resolve which tenant a billing request acts as (spec 5.2 → 1.3).
 *
 * Copies `features/storage/context.ts` deliberately: a request is ORG-scoped when
 * it carries a `slug`, PERSONAL-scoped otherwise. Org access goes through the
 * shared RBAC chokepoint (`requireOrgPermission`), so paying is authorized by the
 * same mechanism as every other org action (§4.2) rather than a bespoke check.
 *
 * A plan attaches to an organization OR a personal account (spec 5.2, B2B vs
 * B2C), which is exactly the XOR that `billing_customer` enforces in the schema.
 */
export type BillingOwner =
  { kind: "organization"; organizationId: string } | { kind: "personal"; accountId: string };

export interface ResolvedBillingOwner {
  owner: BillingOwner;
  userId: string;
  /** Who to name on the provider customer record. */
  email: string;
  name: string | null;
  /** Present for organizations only — used to build return URLs. */
  orgSlug: string | null;
}

export async function resolveBillingOwner(slug: string | null): Promise<ResolvedBillingOwner> {
  if (slug) {
    const ctx = await requireOrgPermission(slug, "billing.manage");
    return {
      owner: { kind: "organization", organizationId: ctx.org.id },
      userId: ctx.session.user.id,
      email: ctx.session.user.email,
      name: ctx.org.name,
      orgSlug: ctx.org.slug,
    };
  }

  const session = await requireSession();
  let account = await getPersonalAccountByUserId(session.user.id);
  if (!account) {
    // Self-heal for accounts seeded before personal accounts existed.
    await ensurePersonalAccount(session.user.id);
    account = await getPersonalAccountByUserId(session.user.id);
  }
  if (!account) {
    throw new Error(`no personal account for user ${session.user.id}`);
  }
  return {
    owner: { kind: "personal", accountId: account.id },
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    orgSlug: null,
  };
}
