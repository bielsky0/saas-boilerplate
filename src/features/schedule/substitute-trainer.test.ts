import { describe, expect, it } from "vitest";

class SessionNotFoundError extends Error {
  override name = "SessionNotFoundError";
  constructor() { super("Session not found"); }
}
class SessionAlreadyCancelledError extends Error {
  override name = "SessionAlreadyCancelledError";
  constructor() { super("Session is already cancelled"); }
}
class SessionPastError extends Error {
  override name = "SessionPastError";
  constructor() { super("Session is in the past"); }
}
class TrainerCollisionError extends Error {
  override name = "TrainerCollisionError";
  constructor() { super("New trainer has a schedule conflict at that time"); }
}
class NewTrainerSameAsCurrentError extends Error {
  override name = "NewTrainerSameAsCurrentError";
  constructor() { super("New trainer is the same as the current trainer"); }
}

describe("substituteTrainerInSession error classes", () => {
  it("SessionNotFoundError", () => {
    const err = new SessionNotFoundError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SessionNotFoundError");
    expect(err.message).toMatch(/not found/i);
  });

  it("SessionAlreadyCancelledError", () => {
    const err = new SessionAlreadyCancelledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SessionAlreadyCancelledError");
    expect(err.message).toMatch(/already cancelled/i);
  });

  it("SessionPastError", () => {
    const err = new SessionPastError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SessionPastError");
    expect(err.message).toMatch(/past/i);
  });

  it("TrainerCollisionError", () => {
    const err = new TrainerCollisionError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TrainerCollisionError");
    expect(err.message).toMatch(/conflict|collision/i);
  });

  it("NewTrainerSameAsCurrentError", () => {
    const err = new NewTrainerSameAsCurrentError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("NewTrainerSameAsCurrentError");
    expect(err.message).toMatch(/same/i);
  });
});
