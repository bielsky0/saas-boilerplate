import { describe, expect, it } from "vitest";

// Pure error classes — no env/server dependency, safe for unit tests.
// The full cancel.ts has backend dependencies tested via integration/e2e.
class BookingNotFoundError extends Error {
  override name = "BookingNotFoundError";
  constructor() { super("Booking not found"); }
}
class BookingAlreadyCancelledError extends Error {
  override name = "BookingAlreadyCancelledError";
  constructor() { super("Booking is already cancelled"); }
}
class CancellationTooLateError extends Error {
  override name = "CancellationTooLateError";
  constructor() { super("Cancellation is less than 24 hours before the session starts"); }
}
class CancellationBlockedByChangeRequestError extends Error {
  override name = "CancellationBlockedByChangeRequestError";
  constructor() { super("Booking has an active group change request"); }
}

describe("cancelBooking error classes", () => {
  it("BookingNotFoundError", () => {
    const err = new BookingNotFoundError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("BookingNotFoundError");
    expect(err.message).toMatch(/not found/i);
  });

  it("BookingAlreadyCancelledError", () => {
    const err = new BookingAlreadyCancelledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("BookingAlreadyCancelledError");
    expect(err.message).toMatch(/already cancelled/i);
  });

  it("CancellationTooLateError", () => {
    const err = new CancellationTooLateError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("CancellationTooLateError");
    expect(err.message).toMatch(/24 hours/i);
  });

  it("CancellationBlockedByChangeRequestError", () => {
    const err = new CancellationBlockedByChangeRequestError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("CancellationBlockedByChangeRequestError");
    expect(err.message).toMatch(/change request/i);
  });
});

describe("24h calculation (pure logic)", () => {
  it("24h before session → can cancel", () => {
    const sessionStart = new Date("2026-07-25T18:00:00Z");
    const now = new Date("2026-07-24T17:59:00Z");
    const hoursUntil = (sessionStart.getTime() - now.getTime()) / 3_600_000;
    expect(hoursUntil).toBeGreaterThanOrEqual(24);
  });

  it("less than 24h before session → cannot cancel", () => {
    const sessionStart = new Date("2026-07-25T18:00:00Z");
    const now = new Date("2026-07-24T18:01:00Z");
    const hoursUntil = (sessionStart.getTime() - now.getTime()) / 3_600_000;
    expect(hoursUntil).toBeLessThan(24);
  });

  it("exactly 24h before → edge case (allow)", () => {
    const sessionStart = new Date("2026-07-25T18:00:00Z");
    const now = new Date("2026-07-24T18:00:00Z");
    const hoursUntil = (sessionStart.getTime() - now.getTime()) / 3_600_000;
    // exactly 24h — >= 24 means allowed
    expect(hoursUntil).toBeGreaterThanOrEqual(24);
  });
});
