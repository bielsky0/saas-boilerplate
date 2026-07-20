import { describe, expect, it } from "vitest";

import { buildMonthGrid, defaultMonth } from "./calendar";
import type { AvailabilityRow } from "./calendar";
import { zonedWallClockToUtc } from "@/lib/datetime";

/**
 * Month-grid shaping for the enrollment calendar (F5, EPIK 4, US-15.1).
 *
 * The bug this file exists to catch is a session landing on the wrong calendar
 * cell because its day was read in UTC rather than in the academy's zone. It is
 * invisible for a Warsaw afternoon class — the two agree — and wrong for a late
 * evening one, which is exactly when children's classes happen.
 */

const WARSAW = "Europe/Warsaw";

function row(
  startLocal: [number, number, number, number, number],
  overrides: Partial<AvailabilityRow> = {},
): AvailabilityRow {
  const [y, m, d, h, min] = startLocal;
  const startTime = zonedWallClockToUtc(y, m, d, h, min, WARSAW);
  return {
    sessionId: `s-${y}${m}${d}-${h}${min}`,
    startTime,
    endTime: new Date(startTime.getTime() + 60 * 60_000),
    capacity: 8,
    activeCount: 0,
    locationName: "Hala Centrum",
    ...overrides,
  };
}

/** The cells that carry a real day, dropping the padding blanks. */
function realDays(month: string, rows: AvailabilityRow[]) {
  return buildMonthGrid(month, rows, WARSAW).filter((cell) => cell.dayKey !== null);
}

describe("buildMonthGrid — grid shape", () => {
  it("pads to whole weeks with Monday first", () => {
    // 1 August 2026 is a Saturday: Monday-first means five leading blanks.
    const cells = buildMonthGrid("2026-08", [], WARSAW);
    expect(cells.slice(0, 5).every((cell) => cell.dayKey === null)).toBe(true);
    expect(cells[5]?.dayOfMonth).toBe(1);
    expect(cells.length % 7, "whole weeks, so the last row does not reflow").toBe(0);
  });

  it("covers every day of the month exactly once", () => {
    const days = realDays("2026-02", []);
    expect(days).toHaveLength(28);
    expect(days[0]?.dayKey).toBe("2026-02-01");
    expect(days.at(-1)?.dayKey).toBe("2026-02-28");
  });

  it("handles a leap February", () => {
    expect(realDays("2028-02", [])).toHaveLength(29);
  });

  it("rejects a malformed month", () => {
    expect(() => buildMonthGrid("2026-8", [], WARSAW)).toThrow(/YYYY-MM/);
  });
});

describe("buildMonthGrid — days are LOCAL days", () => {
  it("puts a late-evening class on its local day, not the UTC one", () => {
    // 00:30 local on 2 August is 22:30Z on 1 August. Grouping by
    // toISOString().slice(0,10) would file it under the 1st.
    const late = row([2026, 8, 2, 0, 30]);
    expect(late.startTime.toISOString().slice(0, 10)).toBe("2026-08-01");

    const days = realDays("2026-08", [late]);
    expect(days.find((d) => d.dayKey === "2026-08-01")?.slots).toHaveLength(0);
    expect(days.find((d) => d.dayKey === "2026-08-02")?.slots).toHaveLength(1);
  });

  it("renders the local wall clock, not the UTC one", () => {
    const days = realDays("2026-08", [row([2026, 8, 12, 18, 0])]);
    const slot = days.find((d) => d.dayKey === "2026-08-12")?.slots[0];
    expect(slot?.startsAt).toBe("18:00");
    expect(slot?.endsAt).toBe("19:00");
  });

  it("keeps the same local time on both sides of a DST switch", () => {
    // Two 17:00 sessions an hour apart in UTC must both read as 17:00 (US-1.2/AC1).
    const days = realDays("2026-10", [row([2026, 10, 18, 17, 0]), row([2026, 10, 25, 17, 0])]);
    expect(days.find((d) => d.dayKey === "2026-10-18")?.slots[0]?.startsAt).toBe("17:00");
    expect(days.find((d) => d.dayKey === "2026-10-25")?.slots[0]?.startsAt).toBe("17:00");
  });

  it("groups several sessions on one day and keeps them ordered by the query", () => {
    const days = realDays("2026-08", [row([2026, 8, 12, 17, 0]), row([2026, 8, 12, 19, 0])]);
    const slots = days.find((d) => d.dayKey === "2026-08-12")?.slots ?? [];
    expect(slots.map((s) => s.startsAt)).toEqual(["17:00", "19:00"]);
  });
});

describe("buildMonthGrid — seats", () => {
  it("computes free seats and marks a full session unbookable but still present", () => {
    // US-15.1/AC2: a parent told to pick another date must be able to SEE which
    // dates are full. Filtering them out makes a busy offer look like an empty one.
    const days = realDays("2026-08", [
      row([2026, 8, 12, 17, 0], { capacity: 8, activeCount: 8 }),
      row([2026, 8, 13, 17, 0], { capacity: 8, activeCount: 6 }),
    ]);

    const full = days.find((d) => d.dayKey === "2026-08-12");
    expect(full?.slots[0]?.freeSeats).toBe(0);
    expect(full?.slots[0]?.bookable).toBe(false);
    expect(full?.hasBookableSlot).toBe(false);

    const open = days.find((d) => d.dayKey === "2026-08-13");
    expect(open?.slots[0]?.freeSeats).toBe(2);
    expect(open?.hasBookableSlot).toBe(true);
  });

  it("clamps free seats at zero when capacity was lowered below the bookings taken", () => {
    // Reachable: §5.2 lets an admin lower capacity, refusing NEW seats without
    // evicting existing ones. "-2 wolnych miejsc" is not a thing to show a parent.
    const days = realDays("2026-08", [row([2026, 8, 12, 17, 0], { capacity: 4, activeCount: 6 })]);
    const slot = days.find((d) => d.dayKey === "2026-08-12")?.slots[0];
    expect(slot?.freeSeats).toBe(0);
    expect(slot?.bookable).toBe(false);
  });

  it("marks a day bookable when only one of its sessions has room", () => {
    const days = realDays("2026-08", [
      row([2026, 8, 12, 17, 0], { capacity: 8, activeCount: 8 }),
      row([2026, 8, 12, 19, 0], { capacity: 8, activeCount: 1 }),
    ]);
    expect(days.find((d) => d.dayKey === "2026-08-12")?.hasBookableSlot).toBe(true);
  });
});

describe("defaultMonth", () => {
  const now = zonedWallClockToUtc(2026, 7, 15, 12, 0, WARSAW);

  it("opens on the current month when it has sessions", () => {
    expect(defaultMonth([row([2026, 7, 20, 17, 0])], WARSAW, now)).toBe("2026-07");
  });

  it("skips ahead to the first month that has one", () => {
    // A September season browsed in July: opening on an empty July grid reads as
    // "no classes" rather than "look further ahead".
    expect(defaultMonth([row([2026, 9, 7, 17, 0])], WARSAW, now)).toBe("2026-09");
  });

  it("falls back to the current month when there is nothing to show", () => {
    expect(defaultMonth([], WARSAW, now)).toBe("2026-07");
  });

  it("uses the earliest session, not the first row given", () => {
    expect(defaultMonth([row([2026, 11, 3, 17, 0]), row([2026, 9, 7, 17, 0])], WARSAW, now)).toBe(
      "2026-09",
    );
  });

  it("reads the current month in the academy's zone, not the server's", () => {
    // 00:30 local on 1 August in Warsaw is still 31 July in UTC. An academy whose
    // new month has just begun must not be shown the previous one.
    const justPastMidnight = zonedWallClockToUtc(2026, 8, 1, 0, 30, WARSAW);
    expect(justPastMidnight.toISOString().slice(0, 7)).toBe("2026-07");
    expect(defaultMonth([], WARSAW, justPastMidnight)).toBe("2026-08");
  });
});
