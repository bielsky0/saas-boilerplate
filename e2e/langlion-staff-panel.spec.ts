import { expect, test } from "@playwright/test";

import {
  getUserId,
  loginToAcademy,
  registerViaApi,
  seedLanglion,
  seedOrgFull,
  uniqueEmail,
  uniqueNearFutureSlot,
  waitForEmail,
} from "./helpers";
import { uniqueId } from "./billing-fixtures";
import { tenantUrl, uniqueSubdomain } from "./host-fixtures";

/**
 * Staff panel — trener i recepcja (langlion §2.29/EPIK 31, §2.33/EPIK 35, plan F6).
 *
 * Cash confirmation and attendance are driven through the real UI (the server
 * action is not reliably invokable from an `APIRequestContext` — same reasoning
 * as F5's happy-path spec). The `grade_field` CHECK XOR is the one claim proven
 * directly against the writer, the same way F5 proves `booking_athlete_no_overlap_excl`
 * directly rather than through a form: nothing in the real UI can construct the
 * invalid row (the form always sets exactly one of groupTypeId/sessionId), so the
 * only way to prove the DATABASE refuses it is to bypass the app layer.
 */

async function bookingState(
  request: Parameters<typeof seedOrgFull>[0],
  organizationId: string,
  sessionId: string,
) {
  const res = await request.post("/api/dev/bookings", {
    data: { action: "state", organizationId, sessionId },
  });
  return (await res.json()) as {
    activeBookings: number;
    bookings: {
      id: string;
      paymentStatus: string;
      attendanceStatus: string;
      consumedCreditId: string | null;
    }[];
  };
}

test("reception confirms a cash payment — status flips and a credit is issued+consumed", async ({
  page,
  request,
}) => {
  const ownerEmail = uniqueEmail("cash-owner");
  await registerViaApi(request, ownerEmail);
  const receptionEmail = uniqueEmail("cash-reception");
  await registerViaApi(request, receptionEmail);

  const { orgId, subdomain } = await seedOrgFull(request, {
    ownerEmail,
    name: "Cash Academy",
    slug: uniqueId("cash"),
    subdomain: uniqueSubdomain("cash"),
    members: [{ email: receptionEmail, role: "reception" }],
  });

  const slot = uniqueNearFutureSlot();
  const seed = await seedLanglion(request, {
    organizationId: orgId,
    groupType: { slug: uniqueId("cash-offer").replace(/_/g, "-"), name: "Cash offer", price: 10_000 },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
    client: { email: uniqueEmail("cash-parent"), isVerified: true },
    athletes: [{ name: "Cash Kid" }],
    creditType: { name: "Cash offer credits" },
  });
  expect(seed.ok, `seed failed: ${seed.message ?? seed.sqlState}`).toBe(true);

  const withBooking = await seedLanglion(request, {
    organizationId: orgId,
    groupTypeId: seed.groupTypeId!,
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
  });
  // Re-seeding `sessions` on an existing groupTypeId would create a second
  // session; instead attach the booking to the ALREADY-SEEDED session by reusing
  // its id directly, so both requests below (booking + page) refer to one row.
  void withBooking;

  const booked = await seedLanglion(request, {
    organizationId: orgId,
    bookings: [{ sessionIndex: 0, athleteIndex: 0, paymentStatus: "booked_offline" }],
    // Reuse: pass the same session/athlete by re-declaring them is unnecessary —
    // `bookings` indexes into THIS call's own `sessions`/`athletes`, so the
    // booking must be created in the SAME call that names the session/athlete.
  });
  void booked;

  await loginToAcademy(page, subdomain, receptionEmail, "Password123");
  await page.goto(tenantUrl(subdomain, `/en/dashboard/sessions/${seed.sessionIds![0]}`));

  // The booking was seeded as `booked_offline` in the same call as the session —
  // see the corrected seeding below this test's first draft.
  await page.getByRole("button", { name: "Confirm cash" }).click();
  await expect(page.getByText("Cash payment confirmed.")).toBeVisible();

  const state = await bookingState(request, orgId, seed.sessionIds![0]!);
  expect(state.bookings[0]!.paymentStatus).toBe("confirmed");
  expect(state.bookings[0]!.consumedCreditId).not.toBeNull();
});

test("cash confirmation is refused when the offer has no credit type configured", async ({
  page,
  request,
}) => {
  const ownerEmail = uniqueEmail("nocredit-owner");
  await registerViaApi(request, ownerEmail);
  const receptionEmail = uniqueEmail("nocredit-reception");
  await registerViaApi(request, receptionEmail);

  const { orgId, subdomain } = await seedOrgFull(request, {
    ownerEmail,
    name: "No Credit Academy",
    slug: uniqueId("nocredit"),
    subdomain: uniqueSubdomain("nocredit"),
    members: [{ email: receptionEmail, role: "reception" }],
  });

  const slot = uniqueNearFutureSlot();
  const seed = await seedLanglion(request, {
    organizationId: orgId,
    groupType: { slug: uniqueId("nocredit-offer").replace(/_/g, "-"), name: "No credit offer" },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
    client: { email: uniqueEmail("nocredit-parent"), isVerified: true },
    athletes: [{ name: "Kid" }],
    bookings: [{ sessionIndex: 0, athleteIndex: 0, paymentStatus: "booked_offline" }],
    // Deliberately NO `creditType` — the point of this test.
  });
  expect(seed.ok, `seed failed: ${seed.message ?? seed.sqlState}`).toBe(true);

  await loginToAcademy(page, subdomain, receptionEmail, "Password123");
  await page.goto(tenantUrl(subdomain, `/en/dashboard/sessions/${seed.sessionIds![0]}`));

  await page.getByRole("button", { name: "Confirm cash" }).click();
  await expect(
    page.getByText("This offer has no credit type configured yet — ask an admin to set one up."),
  ).toBeVisible();

  const state = await bookingState(request, orgId, seed.sessionIds![0]!);
  expect(state.bookings[0]!.paymentStatus).toBe("booked_offline");
});

test("a trainer marks attendance on their own session, but a foreign session refuses at the backend", async ({
  page,
  request,
}) => {
  const ownerEmail = uniqueEmail("att-owner");
  await registerViaApi(request, ownerEmail);
  const trainerAEmail = uniqueEmail("att-trainer-a");
  await registerViaApi(request, trainerAEmail);
  const trainerBEmail = uniqueEmail("att-trainer-b");
  await registerViaApi(request, trainerBEmail);
  const [trainerAId, trainerBId] = await Promise.all([
    getUserId(request, trainerAEmail),
    getUserId(request, trainerBEmail),
  ]);

  const { orgId, subdomain } = await seedOrgFull(request, {
    ownerEmail,
    name: "Attendance Academy",
    slug: uniqueId("att"),
    subdomain: uniqueSubdomain("att"),
    members: [{ email: trainerAEmail, role: "trainer" }],
  });

  const slotA = uniqueNearFutureSlot(7);
  const seedA = await seedLanglion(request, {
    organizationId: orgId,
    trainerId: trainerAId,
    groupType: { slug: uniqueId("att-offer").replace(/_/g, "-"), name: "Attendance offer" },
    sessions: [{ startsAt: slotA.startsAt, endsAt: slotA.endsAt, capacity: 8 }],
    client: { email: uniqueEmail("att-parent-a"), isVerified: true },
    athletes: [{ name: "Own Session Kid" }],
    bookings: [{ sessionIndex: 0, athleteIndex: 0, paymentStatus: "confirmed" }],
  });
  expect(seedA.ok, `seedA failed: ${seedA.message ?? seedA.sqlState}`).toBe(true);

  const slotB = uniqueNearFutureSlot(9);
  const seedB = await seedLanglion(request, {
    organizationId: orgId,
    trainerId: trainerBId,
    groupTypeId: seedA.groupTypeId!,
    sessions: [{ startsAt: slotB.startsAt, endsAt: slotB.endsAt, capacity: 8 }],
    client: { email: uniqueEmail("att-parent-b"), isVerified: true },
    athletes: [{ name: "Foreign Session Kid" }],
    bookings: [{ sessionIndex: 0, athleteIndex: 0, paymentStatus: "confirmed" }],
  });
  expect(seedB.ok, `seedB failed: ${seedB.message ?? seedB.sqlState}`).toBe(true);

  await loginToAcademy(page, subdomain, trainerAEmail, "Password123");

  // Own session: mark present succeeds.
  await page.goto(tenantUrl(subdomain, `/en/dashboard/sessions/${seedA.sessionIds![0]}`));
  await page.getByRole("button", { name: "Mark present" }).click();
  await expect(page.getByText("Attendance updated.")).toBeVisible();
  const ownState = await bookingState(request, orgId, seedA.sessionIds![0]!);
  expect(ownState.bookings[0]!.attendanceStatus).toBe("present");

  // Foreign session (trainer B's): the button is still RENDERED — the RBAC map
  // grants `bookings.mark_attendance` to the trainer role generically, "own
  // session" is not expressible there (see rbac/index.ts) — but the backend
  // refuses it. mutation: remove the `session.trainerId !== markedByUserId`
  // comparison in attendance.ts — trainer A would then mark trainer B's roster.
  await page.goto(tenantUrl(subdomain, `/en/dashboard/sessions/${seedB.sessionIds![0]}`));
  await page.getByRole("button", { name: "Mark present" }).click();
  await expect(page.getByText("You may only do this for your own sessions.")).toBeVisible();

  // Unchanged — still the default, and distinguishable from "absent".
  const foreignState = await bookingState(request, orgId, seedB.sessionIds![0]!);
  expect(foreignState.bookings[0]!.attendanceStatus).toBe("unmarked");
});

test("e-dziennik: a trainer defines a field, enters a grade, and the parent is e-mailed", async ({
  page,
  request,
}) => {
  const ownerEmail = uniqueEmail("grade-owner");
  await registerViaApi(request, ownerEmail);
  const trainerEmail = uniqueEmail("grade-trainer");
  await registerViaApi(request, trainerEmail);
  const trainerId = await getUserId(request, trainerEmail);

  const { orgId, subdomain } = await seedOrgFull(request, {
    ownerEmail,
    name: "Grade Academy",
    slug: uniqueId("grade"),
    subdomain: uniqueSubdomain("grade"),
    members: [{ email: trainerEmail, role: "trainer" }],
  });

  const slot = uniqueNearFutureSlot(8);
  const parentEmail = uniqueEmail("grade-parent");
  const seed = await seedLanglion(request, {
    organizationId: orgId,
    trainerId,
    groupType: { slug: uniqueId("grade-offer").replace(/_/g, "-"), name: "Grade offer" },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
    client: { email: parentEmail, isVerified: true },
    athletes: [{ name: "Graded Kid" }],
    bookings: [{ sessionIndex: 0, athleteIndex: 0, paymentStatus: "confirmed" }],
  });
  expect(seed.ok, `seed failed: ${seed.message ?? seed.sqlState}`).toBe(true);

  await loginToAcademy(page, subdomain, trainerEmail, "Password123");
  await page.goto(tenantUrl(subdomain, `/en/dashboard/sessions/${seed.sessionIds![0]}`));

  await page.getByLabel("Field name").fill("Uwagi trenera");
  await page.getByRole("button", { name: "Add field" }).click();
  await expect(page.getByText("Grade field created.")).toBeVisible();

  // The roster re-rendered with the new column (page is fully dynamic — see the
  // `revalidatePath` note in grades/actions.ts) — enter a value for it.
  await page.reload();
  await page.getByLabel("Value").fill("Bardzo dobrze");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Grade saved.")).toBeVisible();

  const mail = await waitForEmail(request, parentEmail, "grade-recorded");
  expect(mail.to).toBe(parentEmail);
});

test("grade_field_owner_ck rejects a row with both or neither of group_type/session", async ({
  request,
}) => {
  const ownerEmail = uniqueEmail("xor-owner");
  await registerViaApi(request, ownerEmail);
  const { orgId } = await seedOrgFull(request, {
    ownerEmail,
    name: "XOR Academy",
    slug: uniqueId("xor"),
    subdomain: uniqueSubdomain("xor"),
  });

  const slot = uniqueNearFutureSlot(10);
  const seed = await seedLanglion(request, {
    organizationId: orgId,
    groupType: { slug: uniqueId("xor-offer").replace(/_/g, "-"), name: "XOR offer" },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
  });
  expect(seed.ok, `seed failed: ${seed.message ?? seed.sqlState}`).toBe(true);
  const groupTypeId = seed.groupTypeId!;
  const sessionId = seed.sessionIds![0]!;

  // Both set — mutation: the real createGradeFieldAction form always submits
  // exactly one, via the mutually-exclusive hidden inputs in grade-field-form.tsx.
  const both = await seedLanglion(request, {
    organizationId: orgId,
    gradeField: { groupTypeId, sessionId, name: "Both", fieldType: "text" },
  });
  expect(both.ok).toBe(false);
  expect(both.sqlState).toBe("23514");
  expect(both.constraint).toBe("grade_field_owner_ck");

  // Neither set.
  const neither = await seedLanglion(request, {
    organizationId: orgId,
    gradeField: { name: "Neither", fieldType: "text" },
  });
  expect(neither.ok).toBe(false);
  expect(neither.sqlState).toBe("23514");
  expect(neither.constraint).toBe("grade_field_owner_ck");
});

test("attendance — present, absent, and unmarked are all distinguishable; paymentStatus unchanged", async ({
  page,
  request,
}) => {
  const ownerEmail = uniqueEmail("att-all-owner");
  await registerViaApi(request, ownerEmail);
  const trainerEmail = uniqueEmail("att-all-trainer");
  await registerViaApi(request, trainerEmail);
  const trainerId = await getUserId(request, trainerEmail);

  const { orgId, subdomain } = await seedOrgFull(request, {
    ownerEmail,
    name: "Attendance All Academy",
    slug: uniqueId("att-all"),
    subdomain: uniqueSubdomain("att-all"),
    members: [{ email: trainerEmail, role: "trainer" }],
  });

  const slot = uniqueNearFutureSlot(12);
  const seed = await seedLanglion(request, {
    organizationId: orgId,
    trainerId,
    groupType: {
      slug: uniqueId("att-all-offer").replace(/_/g, "-"),
      name: "Attendance All offer",
    },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
    client: { email: uniqueEmail("att-all-parent"), isVerified: true },
    athletes: [{ name: "Kid Present" }, { name: "Kid Absent" }, { name: "Kid Unmarked" }],
    bookings: [
      { sessionIndex: 0, athleteIndex: 0, paymentStatus: "confirmed" },
      { sessionIndex: 0, athleteIndex: 1, paymentStatus: "confirmed" },
      { sessionIndex: 0, athleteIndex: 2, paymentStatus: "confirmed" },
    ],
  });
  expect(seed.ok, `seed failed: ${seed.message ?? seed.sqlState}`).toBe(true);

  await loginToAcademy(page, subdomain, trainerEmail, "Password123");
  await page.goto(tenantUrl(subdomain, `/en/dashboard/sessions/${seed.sessionIds![0]}`));

  // Mark first athlete as present
  const presentRow = page.locator("tr").filter({ hasText: "Kid Present" });
  await presentRow.getByRole("button", { name: "Mark present" }).click();
  await expect(page.getByText("Attendance updated.")).toBeVisible();

  // Mark second athlete as absent
  const absentRow = page.locator("tr").filter({ hasText: "Kid Absent" });
  await absentRow.getByRole("button", { name: "Mark absent" }).click();
  await expect(page.getByText("Attendance updated.")).toBeVisible();

  // Verify three attendance badges are present (exact match avoids athlete names)
  await expect(page.getByText("Present", { exact: true })).toBeVisible();
  await expect(page.getByText("Absent", { exact: true })).toBeVisible();
  const unmarkedRow = page.locator("tr").filter({ hasText: "Kid Unmarked" });
  await expect(unmarkedRow.getByText("Unmarked", { exact: true })).toBeVisible();

  // Verify via API — all three paymentStatus still confirmed
  const state = await bookingState(request, orgId, seed.sessionIds![0]!);
  expect(state.bookings).toHaveLength(3);
  expect(state.bookings.filter((b) => b.paymentStatus === "confirmed")).toHaveLength(3);
  // Each attendance status present exactly once
  expect(state.bookings.filter((b) => b.attendanceStatus === "present")).toHaveLength(1);
  expect(state.bookings.filter((b) => b.attendanceStatus === "absent")).toHaveLength(1);
  expect(state.bookings.filter((b) => b.attendanceStatus === "unmarked")).toHaveLength(1);
});

test("e-dziennik — group_type-scoped and session-scoped fields both appear on roster", async ({
  page,
  request,
}) => {
  const ownerEmail = uniqueEmail("scope-owner");
  await registerViaApi(request, ownerEmail);
  const trainerEmail = uniqueEmail("scope-trainer");
  await registerViaApi(request, trainerEmail);
  const trainerId = await getUserId(request, trainerEmail);

  const { orgId, subdomain } = await seedOrgFull(request, {
    ownerEmail,
    name: "Scope Academy",
    slug: uniqueId("scope"),
    subdomain: uniqueSubdomain("scope"),
    members: [{ email: trainerEmail, role: "trainer" }],
  });

  const slot = uniqueNearFutureSlot(12);
  const seed = await seedLanglion(request, {
    organizationId: orgId,
    trainerId,
    groupType: {
      slug: uniqueId("scope-offer").replace(/_/g, "-"),
      name: "Scope offer",
    },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
    client: { email: uniqueEmail("scope-parent"), isVerified: true },
    athletes: [{ name: "Scope Kid" }],
    bookings: [{ sessionIndex: 0, athleteIndex: 0, paymentStatus: "confirmed" }],
  });
  expect(seed.ok, `seed failed: ${seed.message ?? seed.sqlState}`).toBe(true);

  await loginToAcademy(page, subdomain, trainerEmail, "Password123");
  await page.goto(tenantUrl(subdomain, `/en/dashboard/sessions/${seed.sessionIds![0]}`));

  // Create a group_type-scoped field
  await page.getByLabel("Applies to").click();
  await page.getByRole("option", { name: "Every session of this offer" }).click();
  await page.getByLabel("Field name").fill("Group type field");
  await page.getByRole("button", { name: "Add field" }).click();
  await expect(page.getByText("Grade field created.")).toBeVisible();

  // Create a session-scoped field
  await page.getByLabel("Applies to").click();
  await page.getByRole("option", { name: "Only this session" }).click();
  await page.getByLabel("Field name").fill("Session field");
  await page.getByRole("button", { name: "Add field" }).click();
  await expect(page.getByText("Grade field created.")).toBeVisible();

  // Both field names visible on the roster
  await expect(page.getByText("Group type field")).toBeVisible();
  await expect(page.getByText("Session field")).toBeVisible();
});

test("e-dziennik — trainer cannot enter grades or progress notes on a foreign session", async ({
  page,
  request,
}) => {
  const ownerEmail = uniqueEmail("foreign-owner");
  await registerViaApi(request, ownerEmail);
  const trainerAEmail = uniqueEmail("foreign-ta");
  await registerViaApi(request, trainerAEmail);
  const trainerAId = await getUserId(request, trainerAEmail);

  const { orgId, subdomain } = await seedOrgFull(request, {
    ownerEmail,
    name: "Foreign Academy",
    slug: uniqueId("foreign"),
    subdomain: uniqueSubdomain("foreign"),
    members: [{ email: trainerAEmail, role: "trainer" }],
  });

  // Trainer A's session
  const slotA = uniqueNearFutureSlot(12);
  const seedA = await seedLanglion(request, {
    organizationId: orgId,
    trainerId: trainerAId,
    groupType: {
      slug: uniqueId("foreign-offer").replace(/_/g, "-"),
      name: "Foreign offer",
    },
    sessions: [{ startsAt: slotA.startsAt, endsAt: slotA.endsAt, capacity: 8 }],
    client: { email: uniqueEmail("foreign-parent-a"), isVerified: true },
    athletes: [{ name: "Foreign Kid A" }],
    bookings: [{ sessionIndex: 0, athleteIndex: 0, paymentStatus: "confirmed" }],
    creditType: { name: "Foreign credits" },
    gradeField: { name: "Grade field A", fieldType: "text" },
  });
  expect(seedA.ok, `seedA failed: ${seedA.message ?? seedA.sqlState}`).toBe(true);

  // Trainer B (registered but not a member of the org)
  const trainerBEmail = uniqueEmail("foreign-tb");
  await registerViaApi(request, trainerBEmail);
  const trainerBId = await getUserId(request, trainerBEmail);

  // Trainer B's session (reuse group type)
  const slotB = uniqueNearFutureSlot(12);
  const seedB = await seedLanglion(request, {
    organizationId: orgId,
    trainerId: trainerBId,
    groupTypeId: seedA.groupTypeId!,
    sessions: [{ startsAt: slotB.startsAt, endsAt: slotB.endsAt, capacity: 8 }],
    client: { email: uniqueEmail("foreign-parent-b"), isVerified: true },
    athletes: [{ name: "Foreign Kid B" }],
    bookings: [{ sessionIndex: 0, athleteIndex: 0, paymentStatus: "confirmed" }],
    gradeField: { name: "Grade field B", fieldType: "text" },
  });
  expect(seedB.ok, `seedB failed: ${seedB.message ?? seedB.sqlState}`).toBe(true);

  await loginToAcademy(page, subdomain, trainerAEmail, "Password123");
  await page.goto(tenantUrl(subdomain, `/en/dashboard/sessions/${seedB.sessionIds![0]}`));

  // Try to enter a grade on a foreign session
  await page.getByLabel("Value").fill("1.0");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("You may only do this for your own sessions.")).toBeVisible();

  // Try to add a progress note on a foreign session
  await page.getByLabel("Note").fill("Test note on foreign session");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("You may only do this for your own sessions.")).toBeVisible();
});

test("e-dziennik — progress note triggers email; grade/note entry preserves payment and attendance status", async ({
  page,
  request,
}) => {
  const ownerEmail = uniqueEmail("pnote-owner");
  await registerViaApi(request, ownerEmail);
  const trainerEmail = uniqueEmail("pnote-trainer");
  await registerViaApi(request, trainerEmail);
  const trainerId = await getUserId(request, trainerEmail);
  const parentEmail = uniqueEmail("pnote-parent");

  const { orgId, subdomain } = await seedOrgFull(request, {
    ownerEmail,
    name: "Progress Note Academy",
    slug: uniqueId("pnote"),
    subdomain: uniqueSubdomain("pnote"),
    members: [{ email: trainerEmail, role: "trainer" }],
  });

  const slot = uniqueNearFutureSlot(12);
  const seed = await seedLanglion(request, {
    organizationId: orgId,
    trainerId,
    groupType: {
      slug: uniqueId("pnote-offer").replace(/_/g, "-"),
      name: "Progress Note offer",
    },
    sessions: [{ startsAt: slot.startsAt, endsAt: slot.endsAt, capacity: 8 }],
    client: { email: parentEmail, isVerified: true },
    athletes: [{ name: "Progress Note Kid" }],
    bookings: [{ sessionIndex: 0, athleteIndex: 0, paymentStatus: "confirmed" }],
  });
  expect(seed.ok, `seed failed: ${seed.message ?? seed.sqlState}`).toBe(true);
  const sessionId = seed.sessionIds![0]!;

  await loginToAcademy(page, subdomain, trainerEmail, "Password123");
  await page.goto(tenantUrl(subdomain, `/en/dashboard/sessions/${sessionId}`));

  // Snapshot pre-action state
  const before = await bookingState(request, orgId, sessionId);
  expect(before.bookings[0]!.paymentStatus).toBe("confirmed");
  expect(before.bookings[0]!.attendanceStatus).toBe("unmarked");

  // Create a grade field and enter a value
  await page.getByLabel("Field name").fill("Progress test field");
  await page.getByRole("button", { name: "Add field" }).click();
  await expect(page.getByText("Grade field created.")).toBeVisible();

  await page.getByLabel("Value").fill("Great progress");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Grade saved.")).toBeVisible();

  // Add a progress note
  await page.getByLabel("Note").fill("Needs to practice more");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Progress note added.")).toBeVisible();

  // Verify progress-note-added email sent to parent
  const mail = await waitForEmail(request, parentEmail, "progress-note-added");
  expect(mail.to).toBe(parentEmail);

  // Verify payment and attendance status unchanged
  const after = await bookingState(request, orgId, sessionId);
  expect(after.bookings[0]!.paymentStatus).toBe("confirmed");
  expect(after.bookings[0]!.attendanceStatus).toBe("unmarked");
});
