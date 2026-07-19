import { expect, test, type APIRequestContext } from "@playwright/test";

import { registerViaApi, rlsProbe, seedOrgFull, uniqueEmail } from "./helpers";

/**
 * Row-Level Security acceptance (US-1.1/AC1, spec §1.3).
 *
 * AC1 requires that a query returns only its own tenant's rows "even if the
 * application layer omits the filter". Every real data-access function includes
 * that filter, so proving the property needs a caller that deliberately does not:
 * /api/dev/rls-probe, whose queries have no `organizationId` predicate at all.
 *
 * READ THE FIRST TEST BEFORE THE OTHERS. RLS is bypassed unconditionally by a
 * superuser and by a table owner without FORCE. If the app connected as
 * `postgres`, every isolation assertion below would pass while proving nothing at
 * all. That test is not a nicety — it is what makes the rest of this file mean
 * something.
 */

const LANGLION_TABLES = [
  "location",
  "group_type",
  "group_type_recurrence",
  "class_session",
  "client",
  "athlete",
  "booking",
];

/** A slug/subdomain no parallel worker can collide with. */
function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** An academy with one location, so the probe has something to see. */
async function seedAcademy(request: APIRequestContext, prefix: string): Promise<string> {
  const owner = uniqueEmail(prefix);
  await registerViaApi(request, owner);
  const { orgId } = await seedOrgFull(request, {
    ownerEmail: owner,
    slug: uniqueSlug(prefix),
    name: `RLS ${prefix}`,
  });
  const res = await request.post("/api/dev/seed-langlion", {
    data: { organizationId: orgId, locationName: `Hala ${Math.floor(Math.random() * 1e6)}` },
  });
  if (!res.ok()) throw new Error(`seed location failed (${res.status()}): ${await res.text()}`);
  return orgId;
}

test.describe("RLS environment", () => {
  test("the app connects as a role RLS actually applies to", async ({ request }) => {
    const probe = await rlsProbe(request, { mode: "raw" });
    const role = probe.environment.role;

    expect(role, "probe returned no role info").not.toBeNull();
    // If either of these is true, RLS is off for this connection and every other
    // test in this file is vacuous. See docs/ARCHITECTURE.md "Two database URLs".
    expect(role!.usesuper, `${role!.current_user} is a superuser — RLS cannot apply`).toBe(false);
    expect(role!.rolbypassrls, `${role!.current_user} has BYPASSRLS`).toBe(false);
  });

  test("every langlion table has RLS enabled and forced", async ({ request }) => {
    const probe = await rlsProbe(request, { mode: "raw" });
    const byName = new Map(probe.environment.tables.map((t) => [t.relname, t]));

    for (const name of LANGLION_TABLES) {
      const row = byName.get(name);
      expect(row, `${name} is missing`).toBeDefined();
      expect(row!.relrowsecurity, `${name} has no RLS`).toBe(true);
      // FORCE is the half that is easy to forget: without it the table OWNER is
      // exempt, which is precisely the role migrations and backfills run as.
      expect(row!.relforcerowsecurity, `${name} has RLS but not FORCE`).toBe(true);
    }
  });
});

test.describe("tenant isolation", () => {
  test("an unfiltered query returns only the active tenant's rows", async ({ request }) => {
    const orgA = await seedAcademy(request, "rlsa");
    const orgB = await seedAcademy(request, "rlsb");

    const probe = await rlsProbe(request, { mode: "tenant", organizationId: orgA });
    expect(probe.ok).toBe(true);
    expect(probe.rows!.length).toBeGreaterThan(0);
    // The query carried no organizationId predicate. Everything filtering here is
    // the policy — including the absence of org B's rows, and of every other
    // parallel worker's tenant.
    expect(probe.rows!.every((r) => r.organizationId === orgA)).toBe(true);
    expect(probe.rows!.some((r) => r.organizationId === orgB)).toBe(false);
  });

  test("with no tenant context, an unfiltered query returns nothing", async ({ request }) => {
    await seedAcademy(request, "rlsraw");

    const probe = await rlsProbe(request, { mode: "raw" });
    expect(probe.ok).toBe(true);
    // Fail CLOSED. An unset GUC makes the policy predicate NULL, which denies.
    // The alternative — an unset context meaning "no restriction" — is the shape
    // of every RLS incident ever written up.
    expect(probe.rows).toEqual([]);
  });

  test("the tenant context does not leak onto the next transaction", async ({ request }) => {
    const orgId = await seedAcademy(request, "rlsleak");

    const scoped = await rlsProbe(request, { mode: "tenant", organizationId: orgId });
    expect(scoped.rows!.length).toBeGreaterThan(0);

    // Immediately afterwards, on the same pool: if `set_config` had been given
    // `false` (session scope) instead of `true` (transaction scope), the context
    // would still be set on whichever connection this lands on, and one tenant's
    // rows would be visible to an unrelated request. One character, worst bug.
    const after = await rlsProbe(request, { mode: "raw" });
    expect(after.rows).toEqual([]);
  });

  test("a write claiming another tenant is refused by the policy", async ({ request }) => {
    const orgA = await seedAcademy(request, "rlswa");
    const orgB = await seedAcademy(request, "rlswb");

    const probe = await rlsProbe(request, {
      mode: "tenant",
      action: "insert",
      organizationId: orgA,
      foreignOrganizationId: orgB,
    });

    // WITH CHECK, not just USING: reading is only half of isolation. Without it a
    // tenant could write rows into another tenant it cannot even see.
    expect(probe.ok).toBe(false);
    expect(probe.sqlState).toBe("42501");
  });

  test("withSystemBypass sees across tenants", async ({ request }) => {
    const orgA = await seedAcademy(request, "rlsbya");
    const orgB = await seedAcademy(request, "rlsbyb");

    const probe = await rlsProbe(request, { mode: "bypass" });
    expect(probe.ok).toBe(true);
    // The documented escape hatch has to actually work, or its callers will
    // quietly reinvent it somewhere the ESLint fence cannot see.
    const seen = new Set(probe.rows!.map((r) => r.organizationId));
    expect(seen.has(orgA)).toBe(true);
    expect(seen.has(orgB)).toBe(true);
  });
});
