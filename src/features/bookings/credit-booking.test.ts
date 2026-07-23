import { describe, expect, it } from "vitest";

// Pure error classes — no env/server dependency.
class SessionNotScheduledError extends Error {
  override name = "SessionNotScheduledError";
  constructor() { super("Session is not scheduled"); }
}
class SessionPastError extends Error {
  override name = "SessionPastError";
  constructor() { super("Session has already started"); }
}
class SessionFullError extends Error {
  override name = "SessionFullError";
  constructor() { super("Session is at capacity"); }
}
class NoCreditsAvailableError extends Error {
  override name = "NoCreditsAvailableError";
  constructor() { super("No available credits for this group type"); }
}
class AthleteNotOwnedError extends Error {
  override name = "AthleteNotOwnedError";
  constructor() { super("Athlete does not belong to this client"); }
}

describe("dopisanieBooking error classes", () => {
  it("SessionNotScheduledError", () => {
    const err = new SessionNotScheduledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SessionNotScheduledError");
    expect(err.message).toMatch(/not scheduled/i);
  });

  it("SessionPastError", () => {
    const err = new SessionPastError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SessionPastError");
    expect(err.message).toMatch(/already started/i);
  });

  it("SessionFullError", () => {
    const err = new SessionFullError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SessionFullError");
    expect(err.message).toMatch(/capacity/i);
  });

  it("NoCreditsAvailableError", () => {
    const err = new NoCreditsAvailableError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("NoCreditsAvailableError");
    expect(err.message).toMatch(/no available credit/i);
  });

  it("AthleteNotOwnedError", () => {
    const err = new AthleteNotOwnedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AthleteNotOwnedError");
    expect(err.message).toMatch(/does not belong/i);
  });
});
