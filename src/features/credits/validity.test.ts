import { describe, expect, it } from "vitest";

import { endOfMonthValidity, localYearMonth } from "./validity";

/**
 * Credit expiry is computed in the ACADEMY's zone, never the server's
 * (US-1.2/AC3, §1.2).
 *
 * The failure this file exists to catch is quiet in the worst way: a credit that
 * expires a few hours early looks, to everyone who did not own it, exactly like a
 * credit that expired correctly. There is no error, no log line, and the parent
 * discovers it by finding a wallet emptier than they paid for.
 *
 * Warsaw is UTC+1 in winter and UTC+2 in summer, so the boundary instant differs
 * by an hour between months — which is precisely why it cannot be hardcoded.
 */

const WARSAW = "Europe/Warsaw";
const KOLKATA = "Asia/Kolkata"; // +05:30 — a half-hour offset, no DST.
const AUCKLAND = "Pacific/Auckland"; // Southern hemisphere: DST runs the other way.

describe("endOfMonthValidity", () => {
  it("returns the first instant of the next month, local time", () => {
    // Mid-January in Warsaw (CET, +01) → 1 Feb 00:00 local = 31 Jan 23:00 UTC.
    const validUntil = endOfMonthValidity(new Date("2026-01-15T12:00:00Z"), WARSAW);
    expect(validUntil.toISOString()).toBe("2026-01-31T23:00:00.000Z");
  });

  it("uses the offset in force at the boundary, not at issue time", () => {
    // Issued in March (CET, +01) but expiring into April (CEST, +02): the
    // boundary instant is 22:00 UTC, not 23:00. Computing the offset once, at
    // issue time, would be an hour wrong — and a whole month of credits with it.
    const validUntil = endOfMonthValidity(new Date("2026-03-10T09:00:00Z"), WARSAW);
    expect(validUntil.toISOString()).toBe("2026-03-31T22:00:00.000Z");
  });

  it("rolls December into January of the following year", () => {
    const validUntil = endOfMonthValidity(new Date("2026-12-20T10:00:00Z"), WARSAW);
    expect(validUntil.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });

  it("handles a half-hour offset zone", () => {
    // Kolkata is +05:30, so the boundary lands on a :30 instant. A helper that
    // reasoned in whole hours would pass every other test in this file.
    const validUntil = endOfMonthValidity(new Date("2026-06-10T00:00:00Z"), KOLKATA);
    expect(validUntil.toISOString()).toBe("2026-06-30T18:30:00.000Z");
  });

  it("handles a southern-hemisphere zone whose DST runs the opposite way", () => {
    // Auckland is +12 in July (its winter) — the reverse of Warsaw's summer.
    const validUntil = endOfMonthValidity(new Date("2026-07-05T00:00:00Z"), AUCKLAND);
    expect(validUntil.toISOString()).toBe("2026-07-31T12:00:00.000Z");
  });

  it("is exclusive: a credit issued in a month is still valid at the last local second", () => {
    const validUntil = endOfMonthValidity(new Date("2026-01-15T12:00:00Z"), WARSAW);
    // 31 Jan 23:59:59 local = 22:59:59 UTC — inside the window.
    expect(new Date("2026-01-31T22:59:59Z") < validUntil).toBe(true);
    // 1 Feb 00:00:00 local = 31 Jan 23:00:00 UTC — the boundary itself is out.
    expect(new Date("2026-01-31T23:00:00Z") < validUntil).toBe(false);
  });

  it("assigns a late-evening purchase to the local month, not the UTC one", () => {
    // 23:30 on 31 January in Warsaw is already 22:30Z on the 31st — same month
    // here. Auckland is the case that actually diverges: 31 Jan 23:30 local is
    // 30 Jan 10:30Z, and a UTC reading would still say January, so the pair below
    // pins the local reading rather than a coincidence.
    const lateWarsaw = endOfMonthValidity(new Date("2026-01-31T22:30:00Z"), WARSAW);
    expect(lateWarsaw.toISOString()).toBe("2026-01-31T23:00:00.000Z");

    // 1 Feb 00:30 local Warsaw = 31 Jan 23:30Z: a UTC reading says January and
    // would expire this credit thirty minutes after issuing it. The local reading
    // says February.
    const justPastMidnight = endOfMonthValidity(new Date("2026-01-31T23:30:00Z"), WARSAW);
    expect(justPastMidnight.toISOString()).toBe("2026-02-28T23:00:00.000Z");
  });
});

describe("localYearMonth", () => {
  it("reads the month in the given zone, not UTC", () => {
    const instant = new Date("2026-01-31T23:30:00Z"); // 1 Feb 00:30 in Warsaw
    expect(localYearMonth(instant, WARSAW)).toEqual({ year: 2026, month: 2 });
    expect(localYearMonth(instant, "UTC")).toEqual({ year: 2026, month: 1 });
  });
});
