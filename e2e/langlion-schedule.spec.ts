import { tenantUrl } from "./host-fixtures";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  drainJobs,
  getLanglionState,
  loginToAcademy,
  registerAndVerify,
  seedOrgFull,
  uniqueEmail,
  TEST_PASSWORD,
  wallClockIn,
  weekdayIn,
} from "./helpers";

/**
 * Schedule-First administration (langlion EPIK 2, EPIK 3, EPIK 22; §2.2, §2.12).
 *
 * The phase's DoD flow, end to end through the real UI: location → group type →
 * pattern → season generated in the background → season extended without
 * duplicates → pattern moved mid-season, skipping the session an admin had
 * adjusted by hand.
 *
 * TWO KINDS OF ASSERTION, deliberately. The page proves an operator can do and
 * see the thing; `getLanglionState` proves the ROWS are right. A season's
 * correctness lives in instants, flags and provenance, and a rendered table
 * states none of those precisely enough to assert on — while a state check alone
 * would pass happily against a UI nobody can actually use.
 *
 * EVERY TEST MINTS ITS OWN ACADEMY AND ITS OWN TRAINER. The §5.1 exclusion
 * constraint is global over time ("this trainer is busy then", forever), the
 * suite shares one database with no teardown, and it runs `fullyParallel`
 * locally. A shared trainer would collide between unrelated workers and fail as a
 * constraint error that looks like a real bug. Same discipline as
 * `langlion-constraints.spec.ts`.
 */

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Shift a `datetime-local` value by minutes, staying in naive wall-clock terms.
 *
 * Deliberately string arithmetic on a naive value, NOT `new Date(...)`: the input
 * carries no zone, and round-tripping it through a `Date` would reinterpret it in
 * whichever zone the test runner happens to sit in — silently making the test
 * assert something different on CI than locally.
 */
function shiftLocalInput(value: string, minutes: number): string {
  const [date, time] = value.split("T");
  const [hour, minute] = time!.split(":").map(Number);
  const total = hour! * 60 + minute! + minutes;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date}T${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/** The date portion of an instant, used to find its row in the schedule table. */
function pinnedLabel(iso: string): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Warsaw",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * Log in ON THE ACADEMY'S HOST and WAIT for the redirect to land.
 *
 * Two hazards in one helper. Submitting without waiting for the destination lets
 * the next `page.goto` race the session cookie, silently landing back on login —
 * a failure that reads as "permission test saw 200 instead of 403" rather than
 * as a timing bug. And since F4.6 the host matters: signing in at the apex would
 * mint a cookie that is never sent to `{subdomain}`, because §2.19 exception #5
 * keeps staff sessions host-scoped on purpose.
 */
async function loginAndLand(page: Page, subdomain: string, email: string) {
  await loginToAcademy(page, subdomain, email, TEST_PASSWORD);
}

/**
 * Drain until the queue is genuinely idle.
 *
 * A single `drainJobs` is not enough to assert on afterwards, and the reason is
 * structural rather than incidental: the drain is GLOBAL and the app kicks its own
 * drain via `after()` once the action's response is sent. So this test's job can
 * be claimed and still executing inside the server when our own drain returns
 * having claimed nothing. Looping until two consecutive passes claim nothing
 * closes that window — the first zero can mean "someone else has it", the second
 * means it has finished.
 *
 * Deliberately NOT solved with a `dedupeKey` on `sessions.generate`. A dedupe key
 * is unique FOREVER in this queue, so keying by recurrence would make the second
 * generation — the one that extends a season — silently vanish.
 */
async function settleJobs(request: APIRequestContext) {
  let idleStreak = 0;
  for (let attempt = 0; attempt < 20 && idleStreak < 2; attempt += 1) {
    const result = await drainJobs(request);
    idleStreak = result.claimed === 0 ? idleStreak + 1 : 0;
    if (idleStreak < 2) await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/** A verified owner, an academy in a DST-observing zone, and a trainer in it. */
async function seedAcademy(request: APIRequestContext, prefix: string) {
  const ownerEmail = uniqueEmail(`${prefix}-own`);
  const trainerEmail = uniqueEmail(`${prefix}-tr`);
  await registerAndVerify(request, ownerEmail);
  await registerAndVerify(request, trainerEmail);

  const { slug, orgId } = await seedOrgFull(request, {
    ownerEmail,
    slug: uniqueSlug(prefix),
    name: `Academy ${prefix}`,
    // Europe/Warsaw on purpose: it observes DST, so a season generated here is a
    // real test of US-1.2/AC1 rather than an arithmetic one.
    timezone: "Europe/Warsaw",
    currency: "PLN",
    members: [{ email: trainerEmail, role: "trainer" }],
  });

  return { ownerEmail, trainerEmail, slug, orgId };
}

async function createLocation(page: Page, slug: string, name: string) {
  await page.goto(tenantUrl(slug, `/en/dashboard/locations`));
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Address").fill("1 Test Street");
  await page.getByRole("button", { name: "Add location" }).click();
  await expect(page.getByRole("cell", { name })).toBeVisible();
}

async function createGroupType(
  page: Page,
  slug: string,
  values: { name: string; groupSlug: string; description?: string },
) {
  await page.goto(tenantUrl(slug, `/en/dashboard/group-types`));
  await page.getByLabel("Name").fill(values.name);
  await page.getByLabel("URL slug").fill(values.groupSlug);
  if (values.description) {
    await page.getByLabel("Description").fill(values.description);
  }
  await page.getByLabel("Price").fill("12000");
  await page.getByRole("button", { name: "Create group type" }).click();
  await expect(page.getByRole("cell", { name: values.groupSlug })).toBeVisible();
}

/** Fill and submit the "Add a pattern" form on a group type's page. */
async function addPattern(
  page: Page,
  options: {
    day: string;
    startTime: string;
    occurrences: number;
    trainerLabel: string;
    locationName?: string;
  },
) {
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add pattern" }) });
  await form.getByLabel("Day").click();
  await page.getByRole("option", { name: options.day, exact: true }).click();
  await form.getByLabel("Start").fill(options.startTime);
  await form.getByLabel("Trainer").click();
  await page.getByRole("option", { name: options.trainerLabel }).click();
  if (options.locationName) {
    await form.getByLabel("Location").click();
    await page.getByRole("option", { name: options.locationName }).click();
  }
  await form.getByLabel("Number of sessions").fill(String(options.occurrences));
  await form.getByRole("button", { name: "Add pattern" }).click();
}

test.describe("EPIK 2 — group type definition", () => {
  test("an admin creates an offer, and its description survives a round trip", async ({
    page,
    request,
  }) => {
    const { ownerEmail, slug } = await seedAcademy(request, "gt");
    await loginAndLand(page, slug, ownerEmail);

    const groupSlug = uniqueSlug("obozy");
    // US-2.1/AC4 — markdown blurb, optional, purely presentational.
    const description = "## Zimowy obóz\n\nDla dzieci 7–12 lat.";
    await createGroupType(page, slug, { name: "Winter camp", groupSlug, description });

    // AC4's other half: it comes BACK in the edit form. A column that saves but
    // never reloads looks identical to a working one at the moment of saving.
    await page.getByRole("link", { name: "Manage" }).first().click();
    await expect(page.getByLabel("Description")).toHaveValue(description);

    const state = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(state.groupTypes[0]?.description).toBe(description);
    // §2.14 — minor units, stored exactly as typed. No decimal conversion layer.
    expect(state.groupTypes[0]?.price).toBe(12_000);
  });

  test("US-2.1/AC1 — a group type without a price is refused", async ({ page, request }) => {
    const { ownerEmail, slug } = await seedAcademy(request, "gtnop");
    await loginAndLand(page, slug, ownerEmail);

    await page.goto(tenantUrl(slug, `/en/dashboard/group-types`));
    await page.getByLabel("Name").fill("No price");
    await page.getByLabel("URL slug").fill(uniqueSlug("nop"));
    await page.getByLabel("Price").fill("");
    await page.getByRole("button", { name: "Create group type" }).click();

    // The browser's own required-field guard stops the submit; nothing is written.
    const state = await getLanglionState(request, { orgSlug: slug });
    expect(state.groupTypes).toHaveLength(0);
  });

  test("US-2.2 — editing the Definition leaves generated sessions untouched", async ({
    page,
    request,
  }) => {
    const { ownerEmail, trainerEmail, slug } = await seedAcademy(request, "def");
    await loginAndLand(page, slug, ownerEmail);

    const groupSlug = uniqueSlug("regular");
    await createLocation(page, slug, "Main hall");
    await createGroupType(page, slug, { name: "Regular", groupSlug });
    await page.getByRole("link", { name: "Manage" }).first().click();
    await addPattern(page, {
      day: "Monday",
      startTime: "17:00",
      occurrences: 4,
      trainerLabel: trainerEmail,
    });
    await settleJobs(request);

    const before = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(before.sessions).toHaveLength(4);
    const capacitiesBefore = before.sessions.map((s) => s.capacity);
    const startsBefore = before.sessions.map((s) => s.startTime);

    // Raise the price on the Definition. Zasada nadrzędna #1: Realisations that
    // already exist do not look back at it.
    await page.getByLabel("Price").fill("99900");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Group type updated.")).toBeVisible();

    const after = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(after.groupTypes[0]?.price).toBe(99_900);
    expect(after.sessions.map((s) => s.capacity)).toEqual(capacitiesBefore);
    expect(after.sessions.map((s) => s.startTime)).toEqual(startsBefore);
  });
});

test.describe("EPIK 3 — season generation", () => {
  test("US-3.1/AC1 — saving a recurring pattern generates the season, with no Generate button", async ({
    page,
    request,
  }) => {
    const { ownerEmail, trainerEmail, slug } = await seedAcademy(request, "gen");
    await loginAndLand(page, slug, ownerEmail);

    const groupSlug = uniqueSlug("season");
    await createLocation(page, slug, "Sports hall");
    await createGroupType(page, slug, { name: "Season", groupSlug });
    await page.getByRole("link", { name: "Manage" }).first().click();

    await addPattern(page, {
      day: "Monday",
      startTime: "17:00",
      occurrences: 30,
      trainerLabel: trainerEmail,
      locationName: "Sports hall",
    });

    // There is no such control anywhere, and its absence IS the acceptance
    // criterion — generation is an effect of saving, not a second decision.
    await expect(page.getByRole("button", { name: /^generate/i })).toHaveCount(0);

    await settleJobs(request);
    const state = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(state.sessions).toHaveLength(30);

    // US-1.2/AC1 — 30 Mondays from Europe/Warsaw span the March/October changes,
    // and every one of them must still start at 17:00 LOCAL. A naive UTC series
    // would drift by an hour for part of the season; this is the assertion that
    // catches it.
    for (const session of state.sessions) {
      expect(wallClockIn(state.timezone, session.startTime)).toBe("17:00");
      expect(weekdayIn(state.timezone, session.startTime)).toBe(1);
    }

    // §2.12 — the pattern's location was copied onto each Realisation.
    const locationIds = new Set(state.sessions.map((s) => s.locationId));
    expect(locationIds.size).toBe(1);
    expect([...locationIds][0]).not.toBeNull();
  });

  test("US-3.1/AC2 — a non-recurring pattern creates exactly one session, synchronously", async ({
    page,
    request,
  }) => {
    const { ownerEmail, trainerEmail, slug } = await seedAcademy(request, "one");
    await loginAndLand(page, slug, ownerEmail);

    const groupSlug = uniqueSlug("oneoff");
    await createGroupType(page, slug, { name: "One off", groupSlug });
    await page.getByRole("link", { name: "Manage" }).first().click();

    const form = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Add pattern" }) });
    await form.getByLabel("Trainer").click();
    await page.getByRole("option", { name: trainerEmail }).click();
    await form.getByLabel("Repeats weekly").uncheck();
    await form.getByRole("button", { name: "Add pattern" }).click();
    await expect(page.getByText("One session created.")).toBeVisible();

    // NO drainJobs() — that is the point of AC2. The session exists already.
    const state = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(state.sessions).toHaveLength(1);
  });

  test("US-3.2 — extending the season adds only the missing dates", async ({ page, request }) => {
    const { ownerEmail, trainerEmail, slug } = await seedAcademy(request, "ext");
    await loginAndLand(page, slug, ownerEmail);

    const groupSlug = uniqueSlug("extend");
    await createGroupType(page, slug, { name: "Extend", groupSlug });
    await page.getByRole("link", { name: "Manage" }).first().click();
    await addPattern(page, {
      day: "Tuesday",
      startTime: "18:00",
      occurrences: 4,
      trainerLabel: trainerEmail,
    });
    await settleJobs(request);

    const first = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(first.sessions).toHaveLength(4);
    const originalIds = first.sessions.map((s) => s.id).sort();

    // Extend 4 → 6 through the edit form.
    const editForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Save pattern" }) })
      .first();
    await editForm.getByLabel("Number of sessions").fill("6");
    await editForm.getByRole("button", { name: "Save pattern" }).click();
    await settleJobs(request);

    const second = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(second.sessions).toHaveLength(6);
    // AC1/AC2 together: the original four are the SAME ROWS, not recreated. Had
    // the §4.4 unique not absorbed the replay, this would be 10 sessions — or 4
    // new ids and 4 orphaned bookings in a later phase.
    const survivingIds = second.sessions.map((s) => s.id);
    for (const id of originalIds) expect(survivingIds).toContain(id);
  });

  test("US-3.2/AC2 — re-running generation is idempotent", async ({ page, request }) => {
    const { ownerEmail, trainerEmail, slug } = await seedAcademy(request, "idem");
    await loginAndLand(page, slug, ownerEmail);

    const groupSlug = uniqueSlug("idem");
    await createGroupType(page, slug, { name: "Idempotent", groupSlug });
    await page.getByRole("link", { name: "Manage" }).first().click();
    await addPattern(page, {
      day: "Wednesday",
      startTime: "16:00",
      occurrences: 5,
      trainerLabel: trainerEmail,
    });
    await settleJobs(request);

    const before = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(before.sessions).toHaveLength(5);

    // Save the pattern again unchanged — the job runs a second time over the same
    // dates. At-least-once delivery makes this the ordinary case, not an edge one
    // (§12.2), so the handler has to be a no-op here.
    const editForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Save pattern" }) })
      .first();
    await editForm.getByRole("button", { name: "Save pattern" }).click();
    await settleJobs(request);

    const after = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(after.sessions).toHaveLength(5);
    expect(after.sessions.map((s) => s.id).sort()).toEqual(before.sessions.map((s) => s.id).sort());
  });
});

test.describe("US-3.4 — editing a pattern mid-season", () => {
  test("moves future sessions in place, and skips the one adjusted by hand", async ({
    page,
    request,
  }) => {
    const { ownerEmail, trainerEmail, slug } = await seedAcademy(request, "move");
    await loginAndLand(page, slug, ownerEmail);

    const groupSlug = uniqueSlug("move");
    await createLocation(page, slug, "Old hall");
    await createGroupType(page, slug, { name: "Movable", groupSlug });
    await page.getByRole("link", { name: "Manage" }).first().click();
    await addPattern(page, {
      day: "Thursday",
      startTime: "17:00",
      occurrences: 5,
      trainerLabel: trainerEmail,
      locationName: "Old hall",
    });
    await settleJobs(request);

    const before = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(before.sessions).toHaveLength(5);
    expect(before.sessions.every((s) => !s.isManuallyAdjusted)).toBe(true);

    // Hand-adjust ONE session through the real schedule UI (US-3.4/AC9) by moving
    // it 30 minutes later. This is the deliberate decision AC8 exists to protect,
    // and going through the page is what proves the flag is set by the path an
    // admin actually takes.
    const pinned = before.sessions[2]!;
    await page.goto(tenantUrl(slug, `/en/dashboard/schedule`));
    const pinnedRow = page.getByRole("row").filter({ hasText: pinnedLabel(pinned.startTime) });
    await pinnedRow.getByRole("button", { name: "Adjust" }).click();
    const pinnedStartInput = page.locator(`#session-${pinned.id}-start`);
    const originalLocal = await pinnedStartInput.inputValue();
    const adjustedLocal = shiftLocalInput(originalLocal, 30);
    await pinnedStartInput.fill(adjustedLocal);
    await page.locator(`#session-${pinned.id}-end`).fill(shiftLocalInput(originalLocal, 90));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Session updated.")).toBeVisible();

    const marked = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    const pinnedAfterAdjust = marked.sessions.find((s) => s.id === pinned.id)!;
    expect(pinnedAfterAdjust.isManuallyAdjusted).toBe(true);
    const pinnedInstant = pinnedAfterAdjust.startTime;

    await page.goto(tenantUrl(slug, `/en/dashboard/group-types`));
    await page.getByRole("link", { name: "Manage" }).first().click();

    // Now move the whole pattern: Thursday 17:00 → Friday 19:00.
    const editForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Save pattern" }) })
      .first();
    await editForm.getByLabel("Day").click();
    await page.getByRole("option", { name: "Friday", exact: true }).click();
    await editForm.getByLabel("Start").fill("19:00");
    await editForm.getByRole("button", { name: "Save pattern" }).click();
    await expect(page.getByText(/skipped/i)).toBeVisible();
    await settleJobs(request);

    const after = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    const movedPinned = after.sessions.find((s) => s.id === pinned.id)!;

    // AC8 — the hand-adjusted session kept BOTH its instant and its flag.
    expect(movedPinned.startTime).toBe(pinnedInstant);
    expect(movedPinned.isManuallyAdjusted).toBe(true);

    // AC1 — every other future session moved to the new day AND the new hour.
    // Asserting the weekday too is what makes this a test of "the pattern moved"
    // rather than "the clock changed": a delta-based implementation would pass
    // the time check and fail this one.
    const moved = after.sessions.filter((s) => s.id !== pinned.id && !s.isManuallyAdjusted);
    expect(moved.length).toBeGreaterThan(0);
    for (const session of moved) {
      expect(wallClockIn(after.timezone, session.startTime)).toBe("19:00");
      expect(weekdayIn(after.timezone, session.startTime)).toBe(5);
    }
  });

  test("US-22.4 — changing the pattern's location updates future sessions", async ({
    page,
    request,
  }) => {
    const { ownerEmail, trainerEmail, slug } = await seedAcademy(request, "loc");
    await loginAndLand(page, slug, ownerEmail);

    const groupSlug = uniqueSlug("relocate");
    await createLocation(page, slug, "Hall A");
    await createLocation(page, slug, "Hall B");
    await createGroupType(page, slug, { name: "Relocatable", groupSlug });
    await page.getByRole("link", { name: "Manage" }).first().click();
    await addPattern(page, {
      day: "Saturday",
      startTime: "10:00",
      occurrences: 3,
      trainerLabel: trainerEmail,
      locationName: "Hall A",
    });
    await settleJobs(request);

    const before = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    const hallA = before.sessions[0]!.locationId;
    expect(before.sessions.every((s) => s.locationId === hallA)).toBe(true);

    const editForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Save pattern" }) })
      .first();
    await editForm.getByLabel("Location").click();
    await page.getByRole("option", { name: "Hall B" }).click();
    await editForm.getByRole("button", { name: "Save pattern" }).click();
    await expect(page.getByText(/future sessions updated/i)).toBeVisible();

    const after = await getLanglionState(request, { orgSlug: slug, groupTypeSlug: groupSlug });
    expect(after.sessions.every((s) => s.locationId !== hallA)).toBe(true);
    expect(new Set(after.sessions.map((s) => s.locationId)).size).toBe(1);
  });
});

test.describe("§4.2 — the backend is the boundary", () => {
  test("a plain member cannot reach the schedule pages", async ({ page, request }) => {
    const ownerEmail = uniqueEmail("rbac-own");
    const memberEmail = uniqueEmail("rbac-mem");
    await registerAndVerify(request, ownerEmail);
    await registerAndVerify(request, memberEmail);

    const { slug } = await seedOrgFull(request, {
      ownerEmail,
      slug: uniqueSlug("rbac"),
      timezone: "Europe/Warsaw",
      currency: "PLN",
      members: [{ email: memberEmail, role: "member" }],
    });

    await loginAndLand(page, slug, memberEmail);

    // A member holds none of the four Faza 2 permissions, so each page 403s —
    // regardless of what the org overview chose to render. UI hiding is cosmetic
    // (spec §4.2); this is the assertion that the real check is server-side.
    for (const path of ["group-types", "schedule", "locations"]) {
      const response = await page.goto(tenantUrl(slug, `/en/dashboard/${path}`));
      expect(response?.status()).toBe(403);
    }
  });

  test("a trainer cannot manage group types either", async ({ page, request }) => {
    const { trainerEmail, slug } = await seedAcademy(request, "trrbac");
    await loginAndLand(page, slug, trainerEmail);

    // The trainer role EXISTS (so the member is not locked out of the org
    // entirely) but carries no Faza 2 permission — its grants arrive in F6.
    const response = await page.goto(tenantUrl(slug, `/en/dashboard/group-types`));
    expect(response?.status()).toBe(403);

    const overview = await page.goto(tenantUrl(slug, "/en/dashboard"));
    expect(overview?.status()).toBe(200);
  });
});
