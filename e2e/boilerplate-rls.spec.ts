import { expect, test, type APIRequestContext } from "@playwright/test";

import { registerViaApi, rlsProbe, seedOrgFull, uniqueEmail } from "./helpers";

/**
 * Row-Level Security on the boilerplate's own tenant tables (F1a, US-1.1/AC1).
 *
 * The langlion core got RLS in F0; `e2e/langlion-rls.spec.ts` covers it and also
 * carries the foundational assertion that the application role is NOT a superuser
 * and does NOT hold BYPASSRLS. That assertion is not repeated here — without it
 * every isolation test in BOTH files would pass while proving nothing, so read it
 * there first, and treat a failure there as invalidating this file too.
 *
 * What is new here is the SECOND OWNER SHAPE. `file` and `notification` may be
 * owned by an organization XOR a personal account, so their policy has two
 * disjuncts reading two different GUCs. The tests that matter most are therefore
 * the account-branch ones: a single-GUC policy would hide a personal account's
 * own rows from it. (In the dev database at the time this landed, 110 of 118
 * `notification` rows were account-owned — the failure mode was not hypothetical.)
 */

/** Tables that MUST be under RLS after F1a. */
const BOILERPLATE_TABLES = ["membership", "invitation", "file", "notification"];

/**
 * Tables that must NOT be under RLS. Asserted negatively and on purpose:
 * `notification_preference` is keyed on the user rather than an owner, so
 * enabling RLS on it without a user GUC would make every preference invisible and
 * silently stop in-app suppression from working — a support ticket, not an error.
 * `organization` and `personal_account` are the owner TARGETS, which a policy
 * keyed on the owner cannot apply to. See each table's schema header.
 */
const EXCLUDED_TABLES = [
  "organization",
  "personal_account",
  "notification_preference",
  "audit_log",
];

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** An org plus its owner, both fresh so parallel workers cannot collide. */
async function seedOrg(
  request: APIRequestContext,
  prefix: string,
): Promise<{ slug: string; orgId: string; ownerEmail: string }> {
  const ownerEmail = uniqueEmail(prefix);
  await registerViaApi(request, ownerEmail);
  const { slug, orgId } = await seedOrgFull(request, {
    ownerEmail,
    name: `${prefix} academy`,
    slug: uniqueSlug(prefix),
    subdomain: uniqueSlug(prefix),
  });
  return { slug, orgId, ownerEmail };
}

test.describe("boilerplate RLS — environment", () => {
  test("every boilerplate tenant table has RLS enabled and forced", async ({ request }) => {
    const probe = await rlsProbe(request, { mode: "raw" });
    for (const name of BOILERPLATE_TABLES) {
      const row = probe.environment.tables.find((t) => t.relname === name);
      expect(row, `${name} not found in pg_class`).toBeDefined();
      expect(row!.relrowsecurity, `${name} has no RLS`).toBe(true);
      // ENABLE alone exempts the table OWNER, which is the migration role.
      expect(row!.relforcerowsecurity, `${name} has RLS but not FORCE`).toBe(true);
    }
  });

  test("the deliberately excluded tables are still outside RLS", async ({ request }) => {
    const probe = await rlsProbe(request, { mode: "raw" });
    for (const name of EXCLUDED_TABLES) {
      const row = probe.environment.excluded.find((t) => t.relname === name);
      expect(row, `${name} not found in pg_class`).toBeDefined();
      expect(
        row!.relrowsecurity,
        `${name} has RLS — if that was deliberate, its schema header and the exclusion list in the probe must say why`,
      ).toBe(false);
    }
  });
});

test.describe("boilerplate RLS — organization branch", () => {
  test("an unfiltered membership read returns only the acting org's rows", async ({ request }) => {
    const a = await seedOrg(request, "rlsboila");
    const b = await seedOrg(request, "rlsboilb");

    const probe = await rlsProbe(request, {
      mode: "owner",
      table: "membership",
      owner: { orgSlug: a.slug },
    });

    expect(probe.ok).toBe(true);
    expect(probe.rows!.length).toBeGreaterThan(0);
    expect(probe.rows!.every((r) => r.organizationId === a.orgId)).toBe(true);
    expect(probe.rows!.some((r) => r.organizationId === b.orgId)).toBe(false);
  });

  test("an unfiltered read with no owner context returns nothing", async ({ request }) => {
    await seedOrg(request, "rlsboilraw");

    // Fail CLOSED. An unset GUC makes both policy disjuncts NULL, which denies —
    // `NULL OR NULL` is NULL, not true. This is the property `nullif(…, '')` and
    // the `missing_ok` argument to `current_setting` exist to produce.
    for (const table of ["membership", "invitation", "file", "notification"] as const) {
      const probe = await rlsProbe(request, { mode: "raw", table });
      expect(probe.ok, `${table} raw read errored`).toBe(true);
      expect(probe.rows, `${table} leaked rows with no owner context`).toEqual([]);
    }
  });
});

test.describe("boilerplate RLS — personal-account branch", () => {
  test("a personal account sees its own files and nobody else's", async ({ request }) => {
    const org = await seedOrg(request, "rlsacct");
    const otherEmail = uniqueEmail("rlsacctother");
    await registerViaApi(request, otherEmail);

    // The dev database has no account-owned files, so the test makes its own —
    // via the positive-control insert, which is the same path asserted below.
    await rlsProbe(request, {
      mode: "owner",
      action: "insert",
      table: "file",
      owner: { userEmail: org.ownerEmail },
      rowOwner: { userEmail: org.ownerEmail },
    });
    await rlsProbe(request, {
      mode: "owner",
      action: "insert",
      table: "file",
      owner: { userEmail: otherEmail },
      rowOwner: { userEmail: otherEmail },
    });

    const probe = await rlsProbe(request, {
      mode: "owner",
      table: "file",
      owner: { userEmail: org.ownerEmail },
    });

    expect(probe.ok).toBe(true);
    expect(probe.rows!.length).toBeGreaterThan(0);
    // Every visible row is account-owned, and all by the SAME account: this is
    // what a single-GUC policy could not produce.
    expect(probe.rows!.every((r) => r.accountId !== null && r.organizationId === null)).toBe(true);
    const accountIds = new Set(probe.rows!.map((r) => r.accountId));
    expect(accountIds.size).toBe(1);
  });

  test("the positive control: writing a row for your own owner succeeds", async ({ request }) => {
    const org = await seedOrg(request, "rlsposctl");

    // Without this, both refusal tests below would pass just as happily against a
    // policy that refuses everything.
    const probe = await rlsProbe(request, {
      mode: "owner",
      action: "insert",
      table: "file",
      owner: { orgSlug: org.slug },
      rowOwner: { orgSlug: org.slug },
    });

    expect(probe.ok, `own-owner write was refused: ${JSON.stringify(probe)}`).toBe(true);
  });
});

test.describe("boilerplate RLS — write refusals", () => {
  test("an account cannot write a file claiming another account", async ({ request }) => {
    const mineEmail = uniqueEmail("rlswmine");
    const theirsEmail = uniqueEmail("rlswtheirs");
    await registerViaApi(request, mineEmail);
    await registerViaApi(request, theirsEmail);

    const probe = await rlsProbe(request, {
      mode: "owner",
      action: "insert",
      table: "file",
      owner: { userEmail: mineEmail },
      rowOwner: { userEmail: theirsEmail },
    });

    // Pins WITH CHECK specifically. USING alone would hide the row afterwards but
    // still let the write land.
    expect(probe.ok).toBe(false);
    expect(probe.sqlState).toBe("42501");
  });

  test("an org context cannot satisfy the account branch of the policy", async ({ request }) => {
    const org = await seedOrg(request, "rlsxbranch");
    const strangerEmail = uniqueEmail("rlsxstranger");
    await registerViaApi(request, strangerEmail);

    // The disjunction is the point: acting as an organization must not let a row
    // through by matching `accountId`. A policy that ORed the two GUCs carelessly
    // — or a wrapper that left the account GUC set from an enclosing scope —
    // would pass everything else in this file and fail here.
    const probe = await rlsProbe(request, {
      mode: "owner",
      action: "insert",
      table: "file",
      owner: { orgSlug: org.slug },
      rowOwner: { userEmail: strangerEmail },
    });

    expect(probe.ok).toBe(false);
    expect(probe.sqlState).toBe("42501");
  });
});

test.describe("boilerplate RLS — context lifetime and the escape hatch", () => {
  test("owner context does not leak into the next query on the pooled connection", async ({
    request,
  }) => {
    const org = await seedOrg(request, "rlsleak");

    const scoped = await rlsProbe(request, {
      mode: "owner",
      table: "membership",
      owner: { orgSlug: org.slug },
    });
    expect(scoped.rows!.length).toBeGreaterThan(0);

    // Immediately after, on the same pool: `set_config(…, true)` is transaction
    // scoped, so the GUC is gone at COMMIT. `false` would make it session scoped
    // and this would return the previous tenant's rows. One character, worst bug.
    const after = await rlsProbe(request, { mode: "raw", table: "membership" });
    expect(after.rows).toEqual([]);
  });

  test("the system bypass still sees across owners", async ({ request }) => {
    const a = await seedOrg(request, "rlsbypa");
    const b = await seedOrg(request, "rlsbypb");

    // The escape hatch has to keep working, or the paths that legitimately need
    // it (super admin, the retention sweep, invitation redemption) would each
    // reinvent one outside the ESLint fence.
    const probe = await rlsProbe(request, { mode: "bypass", table: "membership" });

    expect(probe.ok).toBe(true);
    expect(probe.rows!.some((r) => r.organizationId === a.orgId)).toBe(true);
    expect(probe.rows!.some((r) => r.organizationId === b.orgId)).toBe(true);
  });
});
