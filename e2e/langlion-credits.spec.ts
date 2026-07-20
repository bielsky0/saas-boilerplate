import { expect, test, type Page } from "@playwright/test";

import {
  consumeCredit,
  getCreditState,
  issueCredits,
  runExpirySweep,
  seedCreditType,
} from "./credits-fixtures";
import {
  loginViaUi,
  registerAndVerify,
  seedLanglion,
  seedOrgFull,
  uniqueEmail,
  uniqueFutureSlot,
  TEST_PASSWORD,
} from "./helpers";

/**
 * The credit engine (langlion §0 Zasada nadrzędna #2, §2.4, EPIK 7).
 *
 * Credit is the only settlement currency: every booking, however it was paid for,
 * spends one unit. This phase builds that engine with no client-facing surface —
 * the wallet is F13, the booking path is F5 — so most of these tests drive it
 * through `/api/dev/credits`, which writes through `withTenant` exactly as the
 * application does.
 *
 * EVERY TEST MINTS ITS OWN ACADEMY, ITS OWN TRAINER AND ITS OWN TIME WINDOW, for
 * the reason `langlion-schedule.spec.ts` sets out at length: the §5.1/§5.3
 * exclusion constraints are global over time, the suite shares one database with
 * no teardown, and it runs `fullyParallel` locally.
 */

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** An instant `months` from now, used to order credits by expiry deliberately. */
function monthsFromNow(months: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 15)).toISOString();
}

/**
 * An academy with a group type, a credit type, a parent, two children and two
 * non-overlapping future sessions.
 *
 * The two sessions are what make the concurrency test honest: the same child
 * cannot hold two overlapping bookings (§5.3), so a race over one credit has to
 * be staged across two distinct windows or the constraint would decide the
 * outcome instead of the credit lock.
 */
async function seedAcademy(request: Parameters<typeof seedOrgFull>[0]) {
  const ownerEmail = uniqueEmail("credits-owner");
  await registerAndVerify(request, ownerEmail);
  const org = await seedOrgFull(request, { ownerEmail, slug: uniqueSlug("credits") });

  const trainerEmail = uniqueEmail("credits-trainer");
  const trainerId = await registerAndVerify(request, trainerEmail);

  const first = uniqueFutureSlot();
  const second = {
    startsAt: new Date(new Date(first.startsAt).getTime() + 7 * 86_400_000).toISOString(),
    endsAt: new Date(new Date(first.endsAt).getTime() + 7 * 86_400_000).toISOString(),
  };

  const seeded = await seedLanglion(request, {
    organizationId: org.orgId,
    trainerId,
    locationName: "Hall",
    groupType: { slug: uniqueSlug("gt") },
    sessions: [first, second],
    client: { email: uniqueEmail("parent") },
    athletes: [{ name: "Ada" }, { name: "Bruno" }],
  });
  expect(seeded.ok, `seed failed: ${JSON.stringify(seeded)}`).toBe(true);

  const creditTypeId = await seedCreditType(request, {
    organizationId: org.orgId,
    groupTypeId: seeded.groupTypeId!,
  });

  return {
    ownerEmail,
    org,
    creditTypeId,
    clientId: seeded.clientId!,
    athleteIds: seeded.athleteIds!,
    sessionIds: seeded.sessionIds!,
  };
}

async function loginAndLand(page: Page, email: string) {
  await page.goto("/en/login");
  await loginViaUi(page, email, TEST_PASSWORD);
  await page.waitForURL("**/dashboard");
}

test.describe("credit engine", () => {
  test("consumes the earliest-expiring credit first (US-7.1)", async ({ request }) => {
    const fx = await seedAcademy(request);

    // Issued in the OPPOSITE order to their expiry, deliberately: if consumption
    // fell back to insertion order the test would still pass with the later one
    // spent, and FIFO-by-expiry is what the spec asks for. A credit bought later
    // may well expire sooner.
    const late = await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      validUntil: monthsFromNow(3),
    });
    const early = await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      validUntil: monthsFromNow(1),
    });

    const res = await consumeCredit(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: fx.athleteIds[0]!,
      sessionId: fx.sessionIds[0]!,
    });
    const body = (await res.json()) as { ok: boolean; creditId: string | null; bookingId: string };
    expect(body.ok, JSON.stringify(body)).toBe(true);
    expect(body.creditId).toBe(early.creditIds[0]);

    const state = await getCreditState(request, fx.org.orgId, fx.clientId);
    const spent = state.credits.find((row) => row.id === early.creditIds[0]);
    const kept = state.credits.find((row) => row.id === late.creditIds[0]);
    expect(spent?.status).toBe("used");
    expect(kept?.status).toBe("available");
    expect(state.availableBalance).toBe(1);

    // BOTH SIDES OF THE LINK, not just the credit's. They are redundant by the
    // spec's model, and a single writer is the only thing keeping them honest —
    // so the test asserts the pair rather than trusting it.
    expect(spent?.usedInBookingId).toBe(body.bookingId);
    expect(state.bookings.find((row) => row.id === body.bookingId)?.consumedCreditId).toBe(
      early.creditIds[0],
    );
  });

  test("prefers a credit reserved for this child over a family one (US-7.4/AC2)", async ({
    request,
  }) => {
    const fx = await seedAcademy(request);

    // The family credit expires SOONER, so plain FIFO would take it. The
    // athlete-specific preference has to win, otherwise the reserved credit is
    // stranded: only one child can ever spend it.
    const family = await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: null,
      validUntil: monthsFromNow(1),
    });
    const reserved = await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: fx.athleteIds[0]!,
      validUntil: monthsFromNow(3),
    });

    const res = await consumeCredit(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: fx.athleteIds[0]!,
      sessionId: fx.sessionIds[0]!,
    });
    const body = (await res.json()) as { creditId: string | null };
    expect(body.creditId).toBe(reserved.creditIds[0]);

    const state = await getCreditState(request, fx.org.orgId, fx.clientId);
    expect(state.credits.find((row) => row.id === family.creditIds[0])?.status).toBe("available");
  });

  test("a family credit is spendable by any of the parent's children (US-7.4/AC1)", async ({
    request,
  }) => {
    const fx = await seedAcademy(request);

    const family = await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: null,
      validUntil: monthsFromNow(2),
    });

    // Spent by the SECOND child, who has no credit of their own.
    const res = await consumeCredit(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: fx.athleteIds[1]!,
      sessionId: fx.sessionIds[0]!,
    });
    const body = (await res.json()) as { creditId: string | null };
    expect(body.creditId).toBe(family.creditIds[0]);
  });

  test("a credit reserved for one child is not spendable by a sibling", async ({ request }) => {
    const fx = await seedAcademy(request);

    await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: fx.athleteIds[0]!,
      validUntil: monthsFromNow(2),
    });

    const res = await consumeCredit(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: fx.athleteIds[1]!,
      sessionId: fx.sessionIds[0]!,
    });
    const body = (await res.json()) as { ok: boolean; creditId: string | null };
    // Null, not an error: "this parent has nothing spendable here" is the ordinary
    // signal that routes a client to the purchase path (US-8.1/AC2).
    expect(body.ok).toBe(true);
    expect(body.creditId).toBeNull();
  });

  test("a lapsed credit is unspendable before any sweep has run", async ({ request }) => {
    const fx = await seedAcademy(request);

    // Still flagged `available`: the sweep has not touched it. The point of the
    // test is that availability is decided by `validUntil`, not by the status
    // column — otherwise a missed cron run would let dead credits be spent.
    const lapsed = await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      validUntil: monthsFromNow(-1),
    });

    const before = await getCreditState(request, fx.org.orgId, fx.clientId);
    expect(before.credits.find((row) => row.id === lapsed.creditIds[0])?.status).toBe("available");
    expect(before.availableBalance).toBe(0);

    const res = await consumeCredit(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: fx.athleteIds[0]!,
      sessionId: fx.sessionIds[0]!,
    });
    const body = (await res.json()) as { creditId: string | null };
    expect(body.creditId).toBeNull();
  });

  /**
   * US-7.2 — the whole reason consumption uses `FOR UPDATE SKIP LOCKED`.
   *
   * Two requests, one credit, fired together. `holdMs` keeps the first
   * transaction open after it claims, so the second genuinely arrives while the
   * row is locked rather than passing because the two happened to serialise.
   *
   * VERIFIED WITH A MUTANT, like D38's OTP test: replacing the locking select
   * with a plain SELECT-then-UPDATE makes both requests spend the same credit and
   * this test fail. Without that check it would be a test that passes for the
   * wrong reason.
   */
  test("two parallel consumptions of the last credit: exactly one wins (US-7.2)", async ({
    request,
  }) => {
    const fx = await seedAcademy(request);

    const only = await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      validUntil: monthsFromNow(2),
    });

    // Different sessions for the same child: overlapping ones would be refused by
    // the §5.3 exclusion constraint, which would decide the race for the wrong
    // reason.
    const [first, second] = await Promise.all([
      consumeCredit(request, {
        organizationId: fx.org.orgId,
        clientId: fx.clientId,
        creditTypeId: fx.creditTypeId,
        athleteId: fx.athleteIds[0]!,
        sessionId: fx.sessionIds[0]!,
        holdMs: 400,
      }),
      consumeCredit(request, {
        organizationId: fx.org.orgId,
        clientId: fx.clientId,
        creditTypeId: fx.creditTypeId,
        athleteId: fx.athleteIds[0]!,
        sessionId: fx.sessionIds[1]!,
        holdMs: 400,
      }),
    ]);

    const bodies = await Promise.all([first.json(), second.json()]);
    const claimed = bodies.filter((body) => body.creditId !== null);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].creditId).toBe(only.creditIds[0]);

    const state = await getCreditState(request, fx.org.orgId, fx.clientId);
    expect(state.credits.filter((row) => row.status === "used")).toHaveLength(1);
    expect(state.availableBalance).toBe(0);
    // The loser's booking exists but consumed nothing — F5 is what will refuse to
    // create it in the first place; here the ledger simply must not claim it was
    // paid for.
    expect(state.bookings.filter((row) => row.consumedCreditId !== null)).toHaveLength(1);
  });

  test("the expiry sweep settles lapsed credits and leaves spent ones alone", async ({
    request,
  }) => {
    const fx = await seedAcademy(request);

    const lapsed = await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      validUntil: monthsFromNow(-1),
    });
    const live = await issueCredits(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      validUntil: monthsFromNow(2),
    });

    // Spend the live one first, so the sweep has a `used` row in front of it. A
    // sweep that overwrote `used` with `expired` would erase the record of what a
    // booking was paid with — the ledger's whole purpose.
    const consumed = await consumeCredit(request, {
      organizationId: fx.org.orgId,
      clientId: fx.clientId,
      creditTypeId: fx.creditTypeId,
      athleteId: fx.athleteIds[0]!,
      sessionId: fx.sessionIds[0]!,
    });
    expect(((await consumed.json()) as { creditId: string }).creditId).toBe(live.creditIds[0]);

    await runExpirySweep(request);

    const state = await getCreditState(request, fx.org.orgId, fx.clientId);
    expect(state.credits.find((row) => row.id === lapsed.creditIds[0])?.status).toBe("expired");
    expect(state.credits.find((row) => row.id === live.creditIds[0])?.status).toBe("used");

    // Idempotent, as §12.2 requires of a re-claimable job: a second delivery finds
    // nothing left to change.
    await runExpirySweep(request);
    const again = await getCreditState(request, fx.org.orgId, fx.clientId);
    expect(again.credits.find((row) => row.id === lapsed.creditIds[0])?.status).toBe("expired");
    expect(again.credits.find((row) => row.id === live.creditIds[0])?.status).toBe("used");
  });
});

test.describe("manual grant (US-7.3)", () => {
  test("rejects a grant with no reason, and records the one that succeeds", async ({
    page,
    request,
  }) => {
    const fx = await seedAcademy(request);
    await loginAndLand(page, fx.ownerEmail);

    await page.goto(`/en/orgs/${fx.org.slug}/credits`);
    await expect(page.getByRole("heading", { name: "Credits", exact: true })).toBeVisible();

    /**
     * Fill the whole form, every time.
     *
     * React resets an uncontrolled form after a server action runs, so the
     * pickers come back empty after the rejection below. That is existing
     * repo-wide behaviour rather than anything this page introduces (the location
     * and group-type forms do the same), and the test refills rather than
     * pretending otherwise — a test that assumed the values survived would be
     * asserting a UI that does not exist.
     */
    const fillGrant = async (reason?: string) => {
      await page.getByLabel("Client").click();
      await page.getByRole("option").first().click();
      await page.getByLabel("Credit type").click();
      await page.getByRole("option").first().click();
      await page.getByLabel("How many").fill("3");
      if (reason) await page.getByLabel("Reason").fill(reason);
    };

    // AC1 — no reason, submitted for real. The field carries no `required`
    // attribute precisely so this request reaches the server (see the form's
    // header): the rule that matters is the one enforced there.
    await fillGrant();
    await page.getByRole("button", { name: "Grant credits" }).click();
    await expect(page.getByText(/reason is required/i)).toBeVisible();

    let state = await getCreditState(request, fx.org.orgId, fx.clientId);
    expect(state.credits, "a rejected grant must create nothing").toHaveLength(0);

    // AC2 — the same grant, explained.
    await fillGrant("Missed a term after surgery");
    await page.getByRole("button", { name: "Grant credits" }).click();
    await expect(page.getByText("Credits granted.")).toBeVisible();

    state = await getCreditState(request, fx.org.orgId, fx.clientId);
    expect(state.credits).toHaveLength(3);
    expect(state.availableBalance).toBe(3);
    for (const row of state.credits) {
      expect(row.source).toBe("manual_admin_grant");
      expect(row.reason).toBe("Missed a term after surgery");
      expect(row.grantedByUserId).not.toBeNull();
      // The family wallet by default (US-7.4/AC1) — the picker was left alone.
      expect(row.athleteId).toBeNull();
    }

    // US-1.2/AC3 — expiry is the end of the calendar month in the ACADEMY's zone.
    // Warsaw is the seeded default, so the boundary is 23:00Z or 22:00Z depending
    // on the season; asserting the local reading rather than the UTC one is the
    // point.
    const boundary = new Date(state.credits[0]!.validUntil);
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(boundary);
    expect(local).toMatch(/01\/\d{2}\/\d{4}, 00:00/);

    // AC2 — recoverable afterwards: who, whom, how many, which type, why.
    await page.goto(`/en/orgs/${fx.org.slug}/settings/audit`);
    await expect(page.getByText("Credits granted").first()).toBeVisible();
  });

  test("a role without credits.manual_grant cannot reach the page (§4.2)", async ({
    page,
    request,
  }) => {
    const ownerEmail = uniqueEmail("credits-owner");
    await registerAndVerify(request, ownerEmail);
    const receptionEmail = uniqueEmail("credits-reception");
    await registerAndVerify(request, receptionEmail);

    const org = await seedOrgFull(request, {
      ownerEmail,
      slug: uniqueSlug("credits-rbac"),
      members: [{ email: receptionEmail, role: "reception" }],
    });

    await loginAndLand(page, receptionEmail);
    const res = await page.goto(`/en/orgs/${org.slug}/credits`);
    // 403, not a redirect and not an empty page: the backend is the boundary,
    // and reception genuinely holds a role in this academy — it simply is not
    // granted this permission yet (it arrives in F12 for cash purchases).
    expect(res?.status()).toBe(403);
  });
});
