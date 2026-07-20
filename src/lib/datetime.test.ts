import { describe, expect, it } from "vitest";

import {
  monthRangeInZone,
  shiftMonth,
  wallClockToInstant,
  zonedDayKey,
  zonedWallClock,
  zonedWallClockToUtc,
} from "./datetime";

/**
 * Wall-clock ↔ instant conversion (US-1.2).
 *
 * The forward half moved here from `features/schedule/recurrence.test.ts` when
 * F5 needed the inverse; those cases are unchanged. The inverse and the month
 * range are new, and they exist to catch a specific class of bug that is
 * invisible in the zone this project is developed in: reading a day or an hour
 * in UTC instead of the academy's zone is CORRECT for a Warsaw afternoon and
 * wrong for a Warsaw late evening, wrong for every Auckland class, and wrong for
 * the two months containing a DST switch.
 */

const WARSAW = "Europe/Warsaw";
/** +05:30 year-round — catches any rounding of the offset to whole hours. */
const KOLKATA = "Asia/Kolkata";
/** Southern hemisphere: DST runs the opposite way round from Europe. */
const AUCKLAND = "Pacific/Auckland";

describe("zonedWallClockToUtc", () => {
  it("handles zones with a half-hour offset", () => {
    expect(zonedWallClockToUtc(2026, 6, 1, 17, 0, KOLKATA).toISOString()).toBe(
      "2026-06-01T11:30:00.000Z",
    );
  });

  it("resolves a nonexistent local time forward past the gap", () => {
    // 02:30 on 2026-03-29 does not exist in Warsaw; the clock goes 01:59 -> 03:00 local.
    // Resolving forward yields 03:30 local (01:30Z), which is what a scheduler should do.
    expect(zonedWallClockToUtc(2026, 3, 29, 2, 30, WARSAW).toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
  });

  it("resolves an ambiguous local time to the second, post-transition occurrence", () => {
    // 02:30 on 2026-10-25 happens twice in Warsaw: once at +02 (00:30Z), once at +01
    // (01:30Z). The two-pass probe lands on the later one. Pinned here so the choice
    // is a documented property rather than an accident.
    expect(zonedWallClockToUtc(2026, 10, 25, 2, 30, WARSAW).toISOString()).toBe(
      "2026-10-25T01:30:00.000Z",
    );
  });

  it("round-trips a plain summer and winter time", () => {
    expect(zonedWallClockToUtc(2026, 7, 15, 17, 0, WARSAW).toISOString()).toBe(
      "2026-07-15T15:00:00.000Z",
    );
    expect(zonedWallClockToUtc(2026, 1, 15, 17, 0, WARSAW).toISOString()).toBe(
      "2026-01-15T16:00:00.000Z",
    );
  });
});

describe("zonedDayKey", () => {
  it("groups a late-evening class onto its LOCAL day, not the UTC one", () => {
    // 00:30 local on 2 August in Warsaw is 22:30Z on 1 August. `toISOString().slice(0,10)`
    // would file this session under the 1st and put it on the wrong calendar cell.
    const instant = zonedWallClockToUtc(2026, 8, 2, 0, 30, WARSAW);
    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(zonedDayKey(instant, WARSAW)).toBe("2026-08-02");
  });

  it("agrees with UTC when the local offset does not cross midnight", () => {
    const instant = zonedWallClockToUtc(2026, 8, 2, 18, 0, WARSAW);
    expect(zonedDayKey(instant, WARSAW)).toBe("2026-08-02");
  });

  it("handles a zone far ahead of UTC", () => {
    // 09:00 on 2 August in Auckland is 21:00Z on the 1st — a whole calendar day apart.
    const instant = zonedWallClockToUtc(2026, 8, 2, 9, 0, AUCKLAND);
    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(zonedDayKey(instant, AUCKLAND)).toBe("2026-08-02");
  });

  it("reads the same instant as different days in different zones", () => {
    const instant = new Date("2026-08-01T22:30:00.000Z");
    expect(zonedDayKey(instant, WARSAW)).toBe("2026-08-02");
    expect(zonedDayKey(instant, "UTC")).toBe("2026-08-01");
  });
});

describe("zonedWallClock", () => {
  it("renders the local hour, zero-padded", () => {
    expect(zonedWallClock(zonedWallClockToUtc(2026, 8, 2, 9, 5, WARSAW), WARSAW)).toBe("09:05");
    expect(zonedWallClock(zonedWallClockToUtc(2026, 8, 2, 18, 0, WARSAW), WARSAW)).toBe("18:00");
  });

  it("renders the same local hour on both sides of a DST switch", () => {
    // The point of US-1.2/AC1 seen from the reading side: two sessions an hour apart
    // in UTC must both read as 17:00 to the parent.
    const before = zonedWallClockToUtc(2026, 3, 22, 17, 0, WARSAW);
    const after = zonedWallClockToUtc(2026, 3, 29, 17, 0, WARSAW);
    expect(after.getTime() - before.getTime()).toBe(167 * 3_600_000);
    expect(zonedWallClock(before, WARSAW)).toBe("17:00");
    expect(zonedWallClock(after, WARSAW)).toBe("17:00");
  });

  it("handles a half-hour offset zone", () => {
    expect(zonedWallClock(new Date("2026-06-01T11:30:00.000Z"), KOLKATA)).toBe("17:00");
  });
});

describe("monthRangeInZone", () => {
  it("brackets a month by its LOCAL boundaries", () => {
    // August 2026 in Warsaw is CEST (+02) at both ends.
    const { from, to } = monthRangeInZone("2026-08", WARSAW);
    expect(from.toISOString()).toBe("2026-07-31T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });

  it("handles a month whose two ends sit on different sides of a DST switch", () => {
    // October 2026: starts at +02, ends at +01 because the switch is on the 25th.
    // A range computed with Date.UTC would misplace an hour of sessions at one end.
    const { from, to } = monthRangeInZone("2026-10", WARSAW);
    expect(from.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("rolls over the year boundary", () => {
    const { from, to } = monthRangeInZone("2026-12", "UTC");
    expect(from.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("is half-open, so a session at the exact boundary belongs to one month only", () => {
    const august = monthRangeInZone("2026-08", WARSAW);
    const september = monthRangeInZone("2026-09", WARSAW);
    expect(august.to.getTime()).toBe(september.from.getTime());
  });

  it("rejects a malformed month", () => {
    expect(() => monthRangeInZone("2026-8", WARSAW)).toThrow(/YYYY-MM/);
    expect(() => monthRangeInZone("august", WARSAW)).toThrow(/YYYY-MM/);
  });
});

describe("shiftMonth", () => {
  it("steps forward and back across a year boundary", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("zero-pads a single-digit month", () => {
    expect(shiftMonth("2026-08", 1)).toBe("2026-09");
    expect(shiftMonth("2026-10", -2)).toBe("2026-08");
  });

  it("rejects a malformed month", () => {
    expect(() => shiftMonth("2026", 1)).toThrow(/YYYY-MM/);
  });
});

describe("wallClockToInstant", () => {
  it("resolves a datetime-local value in the academy's zone", () => {
    expect(wallClockToInstant("2026-08-13T18:00", WARSAW)).toEqual(
      new Date("2026-08-13T16:00:00.000Z"),
    );
  });

  it("returns the raw string unchanged when it does not parse", () => {
    // The signature that lets zod own the field error instead of this function
    // inventing one. `""` is what an empty form field posts.
    expect(wallClockToInstant("not-a-date", WARSAW)).toBe("not-a-date");
    expect(wallClockToInstant("", WARSAW)).toBe("");
  });
});
