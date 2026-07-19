import { describe, expect, it } from "vitest";

import { generateOccurrences, zonedWallClockToUtc } from "./recurrence";

/**
 * Timezone correctness for session generation (US-1.2/AC1, spec §2.2).
 *
 * Poland switches to CEST on 2026-03-29 and back to CET on 2026-10-25, both on a
 * Sunday. A weekly Sunday pattern therefore crosses a boundary between two
 * consecutive occurrences, which is the tightest possible test of the wall-clock
 * to UTC conversion: the local hour must stay put while the UTC instant moves.
 */

/** UTC `HH:MM` — asserting on this rather than a full ISO string keeps failures readable. */
function utcHhMm(date: Date): string {
  return date.toISOString().slice(11, 16);
}

const WARSAW = "Europe/Warsaw";

describe("generateOccurrences — DST", () => {
  it("keeps the local hour fixed across the spring forward boundary", () => {
    const occurrences = generateOccurrences({
      startDate: "2026-03-22",
      dayOfWeek: 0,
      startTime: "17:00",
      durationMinutes: 60,
      occurrencesCount: 3,
      timeZone: WARSAW,
    });

    // 22 Mar is CET (+01), 29 Mar and 5 Apr are CEST (+02). Local 17:00 throughout.
    expect(occurrences.map((o) => utcHhMm(o.startsAt))).toEqual(["16:00", "15:00", "15:00"]);
    expect(occurrences.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual([
      "2026-03-22",
      "2026-03-29",
      "2026-04-05",
    ]);
  });

  it("keeps the local hour fixed across the autumn back boundary", () => {
    const occurrences = generateOccurrences({
      startDate: "2026-10-18",
      dayOfWeek: 0,
      startTime: "17:00",
      durationMinutes: 60,
      occurrencesCount: 3,
      timeZone: WARSAW,
    });

    expect(occurrences.map((o) => utcHhMm(o.startsAt))).toEqual(["15:00", "16:00", "16:00"]);
  });

  it("renders the local hour back as 17:00 for every occurrence", () => {
    const occurrences = generateOccurrences({
      startDate: "2026-03-01",
      dayOfWeek: 0,
      startTime: "17:00",
      durationMinutes: 60,
      occurrencesCount: 40,
      timeZone: WARSAW,
    });

    const localHours = occurrences.map((o) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: WARSAW,
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
      }).format(o.startsAt),
    );

    // The real assertion of US-1.2/AC1: 40 weeks spanning both switches, one local time.
    expect(new Set(localHours)).toEqual(new Set(["17:00"]));
  });

  it("treats a class as a fixed number of real minutes, not wall-clock minutes", () => {
    // 02:30 local on the spring-forward night: the local clock jumps 02:00 -> 03:00,
    // so a 60-minute class that starts before the jump ends at 04:30 local, not 03:30.
    const [occurrence] = generateOccurrences({
      startDate: "2026-03-29",
      dayOfWeek: 0,
      startTime: "01:30",
      durationMinutes: 60,
      occurrencesCount: 1,
      timeZone: WARSAW,
    });

    expect(occurrence).toBeDefined();
    expect(occurrence!.endsAt.getTime() - occurrence!.startsAt.getTime()).toBe(60 * 60_000);
  });
});

describe("generateOccurrences — pattern semantics", () => {
  it("starts on the first matching weekday on or after startDate", () => {
    // 2026-06-03 is a Wednesday; asking for Saturday (6) must land on 2026-06-06.
    const [occurrence] = generateOccurrences({
      startDate: "2026-06-03",
      dayOfWeek: 6,
      startTime: "10:00",
      durationMinutes: 45,
      occurrencesCount: 1,
      timeZone: WARSAW,
    });

    expect(occurrence!.startsAt.toISOString().slice(0, 10)).toBe("2026-06-06");
  });

  it("starts on startDate itself when it already matches the weekday", () => {
    const [occurrence] = generateOccurrences({
      startDate: "2026-06-06",
      dayOfWeek: 6,
      startTime: "10:00",
      durationMinutes: 45,
      occurrencesCount: 1,
      timeZone: WARSAW,
    });

    expect(occurrence!.startsAt.toISOString().slice(0, 10)).toBe("2026-06-06");
  });

  it("steps by a calendar week, so the week containing a switch is 167 or 169 hours", () => {
    const occurrences = generateOccurrences({
      startDate: "2026-03-22",
      dayOfWeek: 0,
      startTime: "17:00",
      durationMinutes: 60,
      occurrencesCount: 2,
      timeZone: WARSAW,
    });

    const elapsedHours =
      (occurrences[1]!.startsAt.getTime() - occurrences[0]!.startsAt.getTime()) / 3_600_000;

    // 167, not 168 — a fixed +7*24h step would put this session at 16:00 local.
    expect(elapsedHours).toBe(167);
  });

  it("returns an empty list for a zero count and a single entry for one", () => {
    const base = {
      startDate: "2026-06-01",
      dayOfWeek: 1,
      startTime: "17:00",
      durationMinutes: 60,
      timeZone: WARSAW,
    };

    expect(generateOccurrences({ ...base, occurrencesCount: 0 })).toEqual([]);
    expect(generateOccurrences({ ...base, occurrencesCount: 1 })).toHaveLength(1);
  });

  it("rejects an out-of-range weekday", () => {
    expect(() =>
      generateOccurrences({
        startDate: "2026-06-01",
        dayOfWeek: 7,
        startTime: "17:00",
        durationMinutes: 60,
        occurrencesCount: 1,
        timeZone: WARSAW,
      }),
    ).toThrow(/dayOfWeek/);
  });
});

describe("zonedWallClockToUtc", () => {
  it("handles zones with a half-hour offset", () => {
    // Kolkata is +05:30 year-round; catches any rounding of the offset to whole hours.
    expect(zonedWallClockToUtc(2026, 6, 1, 17, 0, "Asia/Kolkata").toISOString()).toBe(
      "2026-06-01T11:30:00.000Z",
    );
  });

  it("resolves a nonexistent local time forward past the gap", () => {
    // 02:30 on 2026-03-29 does not exist in Warsaw; the clock goes 01:59 -> 03:00 local.
    // Resolving forward yields 03:30 local (01:30Z), which is what a scheduler should do.
    const resolved = zonedWallClockToUtc(2026, 3, 29, 2, 30, WARSAW);
    expect(resolved.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("resolves an ambiguous local time to the second, post-transition occurrence", () => {
    // 02:30 on 2026-10-25 happens twice in Warsaw: once at +02 (00:30Z), once at +01
    // (01:30Z). The two-pass probe lands on the later one. Pinned here so the choice
    // is a documented property rather than an accident — see the note on
    // zonedWallClockToUtc for why it is not worth forcing to the earlier instant.
    const resolved = zonedWallClockToUtc(2026, 10, 25, 2, 30, WARSAW);
    expect(resolved.toISOString()).toBe("2026-10-25T01:30:00.000Z");
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
