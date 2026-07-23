import { describe, expect, it } from "vitest";

class MassMoveTargetSameAsSourceError extends Error {
  override name = "MassMoveTargetSameAsSourceError";
  constructor() { super("Target session is the same as source session"); }
}
class MassMoveDifferentGroupTypeError extends Error {
  override name = "MassMoveDifferentGroupTypeError";
  constructor() { super("Target session must be of the same group type"); }
}
class MassMoveSessionNotFoundError extends Error {
  override name = "MassMoveSessionNotFoundError";
  constructor() { super("Session not found"); }
}
class MassMoveTargetCancelledError extends Error {
  override name = "MassMoveTargetCancelledError";
  constructor() { super("Target session is cancelled"); }
}
class MassMoveTargetPastError extends Error {
  override name = "MassMoveTargetPastError";
  constructor() { super("Target session is in the past"); }
}

describe("massMoveBookings error classes", () => {
  it("MassMoveTargetSameAsSourceError", () => {
    const err = new MassMoveTargetSameAsSourceError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MassMoveTargetSameAsSourceError");
    expect(err.message).toMatch(/same/i);
  });

  it("MassMoveDifferentGroupTypeError", () => {
    const err = new MassMoveDifferentGroupTypeError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MassMoveDifferentGroupTypeError");
    expect(err.message).toMatch(/group type/i);
  });

  it("MassMoveSessionNotFoundError", () => {
    const err = new MassMoveSessionNotFoundError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MassMoveSessionNotFoundError");
    expect(err.message).toMatch(/not found/i);
  });

  it("MassMoveTargetCancelledError", () => {
    const err = new MassMoveTargetCancelledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MassMoveTargetCancelledError");
    expect(err.message).toMatch(/cancelled/i);
  });

  it("MassMoveTargetPastError", () => {
    const err = new MassMoveTargetPastError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MassMoveTargetPastError");
    expect(err.message).toMatch(/past/i);
  });
});
