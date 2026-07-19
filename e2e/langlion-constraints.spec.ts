import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  getUserId,
  registerViaApi,
  seedLanglion,
  seedOrgFull,
  shiftSlot,
  uniqueEmail,
  uniqueFutureSlot,
} from "./helpers";

/**
 * Database-level concurrency guards (Zasada nadrzędna #3; spec §5.1, §5.3, §4.4).
 *
 * The governing principle is that these are enforced by the DATABASE, not by
 * application logic — "check then write" loses under concurrency, and langlion
 * has three places where that would corrupt real money and real schedules. So
 * these tests assert on SQLSTATEs, because that is where the guarantee lives:
 *
 *   23P01  exclusion constraint  — trainer overlap (§5.1), athlete overlap (§5.3)
 *   23505  unique violation      — duplicate generated session (§4.4)
 *
 * EVERY TEST MINTS ITS OWN TRAINER AND ITS OWN TIME WINDOW. The exclusion
 * constraints are global over time: "this trainer is busy 17:00-18:00" holds
 * across the whole table, forever. The suite shares one database with no
 * teardown and runs `fullyParallel` locally, so a shared trainer or a fixed hour
 * would collide between unrelated workers and fail as a constraint error that
 * looks like a real bug. `uniqueFutureSlot()` and `uniqueEmail()` are what keep
 * these independent. (CI runs `workers: 1`, so this bites locally first.)
 */

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** An academy with a trainer and a group type — the minimum for a session. */
async function seedAcademy(request: APIRequestContext, prefix: string) {
  const owner = uniqueEmail(`${prefix}-own`);
  const trainer = uniqueEmail(`${prefix}-tr`);
  await registerViaApi(request, owner);
  await registerViaApi(request, trainer);

  const { orgId } = await seedOrgFull(request, {
    ownerEmail: owner,
    slug: uniqueSlug(prefix),
    name: `Academy ${prefix}`,
    members: [{ email: trainer, role: "member" }],
  });
  const trainerId = await getUserId(request, trainer);
  return { orgId, trainerId };
}

test.describe("§5.1 — a trainer is never double-booked", () => {
  test("back-to-back sessions are allowed; overlapping ones are refused", async ({ request }) => {
    const { orgId, trainerId } = await seedAcademy(request, "tr");
    const first = uniqueFutureSlot(60);
    const adjacent = shiftSlot(first, 60);

    // Adjacent, not overlapping. This is the assertion that the range bounds are
    // '[)' and not the Postgres default '[]': with inclusive upper bounds a
    // 17:00-18:00 and an 18:00-19:00 class would collide and no ordinary
    // timetable could be built at all.
    const ok = await seedLanglion(request, {
      organizationId: orgId,
      trainerId,
      groupType: { slug: uniqueSlug("gt") },
      sessions: [first, adjacent],
    });
    expect(ok.ok, ok.message).toBe(true);
    expect(ok.sessionIds).toHaveLength(2);

    // Overlapping by 30 minutes — refused by the exclusion constraint, not by
    // any application check.
    const clash = await seedLanglion(request, {
      organizationId: orgId,
      trainerId,
      groupType: { slug: uniqueSlug("gt") },
      sessions: [shiftSlot(first, 30)],
    });
    expect(clash.ok).toBe(false);
    expect(clash.sqlState).toBe("23P01");
  });

  test("a cancelled session releases the trainer's slot", async ({ request }) => {
    const { orgId, trainerId } = await seedAcademy(request, "trc");
    const slot = uniqueFutureSlot(60);

    const cancelled = await seedLanglion(request, {
      organizationId: orgId,
      trainerId,
      groupType: { slug: uniqueSlug("gt") },
      sessions: [{ ...slot, status: "cancelled" }],
    });
    expect(cancelled.ok, cancelled.message).toBe(true);

    // decyzja D5: the constraint carries `WHERE status <> 'cancelled'`. Without
    // it a cancelled session would hold its trainer's slot forever, which would
    // only surface in F7 when admins start cancelling sessions (US-19.2) — and
    // could not be fixed then without a data migration.
    const reuse = await seedLanglion(request, {
      organizationId: orgId,
      trainerId,
      groupType: { slug: uniqueSlug("gt") },
      sessions: [slot],
    });
    expect(reuse.ok, reuse.message).toBe(true);
  });
});

test.describe("§5.3 — an athlete is never in two places at once", () => {
  test("overlapping active bookings for one athlete are refused", async ({ request }) => {
    const { orgId } = await seedAcademy(request, "ath");
    const first = uniqueFutureSlot(60);
    const overlapping = shiftSlot(first, 30);

    // Two sessions with NO trainer, so §5.1 cannot be what rejects the second
    // booking — this test must fail for the athlete's sake or not at all.
    const seeded = await seedLanglion(request, {
      organizationId: orgId,
      groupType: { slug: uniqueSlug("gt") },
      sessions: [first, overlapping],
      client: { email: uniqueEmail("parent") },
      athletes: [{ name: "Kid" }],
      bookings: [{ sessionIndex: 0, athleteIndex: 0 }],
    });
    expect(seeded.ok, seeded.message).toBe(true);

    const clash = await seedLanglion(request, {
      organizationId: orgId,
      groupType: { slug: uniqueSlug("gt") },
      sessions: [first, overlapping],
      client: { email: uniqueEmail("parent2") },
      athletes: [{ name: "Kid" }],
      bookings: [
        { sessionIndex: 0, athleteIndex: 0 },
        { sessionIndex: 1, athleteIndex: 0 },
      ],
    });
    expect(clash.ok).toBe(false);
    expect(clash.sqlState).toBe("23P01");
  });

  test("a cancelled booking frees the athlete's time", async ({ request }) => {
    const { orgId } = await seedAcademy(request, "athc");
    const first = uniqueFutureSlot(60);
    const overlapping = shiftSlot(first, 30);

    // "Active" is `payment_status NOT IN ('cancelled')` — so `no_show` still
    // holds the slot, which is intentional: the child was booked and the seat was
    // consumed (US-16.2 attaches no automatic consequence to a no-show).
    const seeded = await seedLanglion(request, {
      organizationId: orgId,
      groupType: { slug: uniqueSlug("gt") },
      sessions: [first, overlapping],
      client: { email: uniqueEmail("parent") },
      athletes: [{ name: "Kid" }],
      bookings: [
        { sessionIndex: 0, athleteIndex: 0, paymentStatus: "cancelled" },
        { sessionIndex: 1, athleteIndex: 0, paymentStatus: "confirmed" },
      ],
    });
    expect(seeded.ok, seeded.message).toBe(true);
    expect(seeded.bookingIds).toHaveLength(2);
  });
});

test.describe("§4.4 — season generation is idempotent", () => {
  test("the same recurrence cannot produce the same start twice", async ({ request }) => {
    const { orgId } = await seedAcademy(request, "gen");
    const slot = uniqueFutureSlot(60);

    const first = await seedLanglion(request, {
      organizationId: orgId,
      groupType: { slug: uniqueSlug("gt") },
      recurrence: {
        dayOfWeek: 1,
        startTime: "17:00",
        durationMinutes: 60,
        capacity: 10,
        isRecurring: true,
        occurrencesCount: 4,
        startDate: "2400-01-03",
      },
      sessions: [slot],
    });
    expect(first.ok, first.message).toBe(true);
    const recurrenceId = first.recurrenceId!;

    // Re-running generation for the same pattern and the same instant. This is
    // what makes US-3.2/AC2 possible: extending a season re-runs the job, and
    // only genuinely missing dates may be inserted.
    const replay = await seedLanglion(request, {
      organizationId: orgId,
      groupTypeId: first.groupTypeId,
      recurrenceId,
      sessions: [slot],
    });
    expect(replay.ok).toBe(false);
    expect(replay.sqlState).toBe("23505");

    // A session with NO pattern never collides here, however many share an
    // instant: NULLs are distinct in a Postgres unique index, and two ad-hoc
    // sessions at the same time are a legitimate thing for an academy to have.
    const adHocA = await seedLanglion(request, {
      organizationId: orgId,
      groupTypeId: first.groupTypeId,
      sessions: [slot],
    });
    const adHocB = await seedLanglion(request, {
      organizationId: orgId,
      groupTypeId: first.groupTypeId,
      sessions: [slot],
    });
    expect(adHocA.ok, adHocA.message).toBe(true);
    expect(adHocB.ok, adHocB.message).toBe(true);
  });
});
