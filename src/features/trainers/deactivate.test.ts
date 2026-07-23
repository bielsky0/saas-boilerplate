import { describe, expect, it } from "vitest";

class TrainerNotFoundError extends Error {
  override name = "TrainerNotFoundError";
  constructor() { super("Trainer not found"); }
}
class TrainerHasFutureSessionsError extends Error {
  override name = "TrainerHasFutureSessionsError";
  readonly sessions: { id: string; startTime: Date; groupTypeName: string }[];
  constructor(sessions: { id: string; startTime: Date; groupTypeName: string }[]) {
    super(`Trainer has ${sessions.length} future session(s)`);
    this.sessions = sessions;
  }
}

describe("TrainerNotFoundError", () => {
  it("name and message", () => {
    const err = new TrainerNotFoundError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TrainerNotFoundError");
    expect(err.message).toMatch(/not found/i);
  });
});

describe("TrainerHasFutureSessionsError", () => {
  it("carries session list", () => {
    const sessions = [
      { id: "s1", startTime: new Date("2026-08-01T10:00:00Z"), groupTypeName: "Piłka" },
      { id: "s2", startTime: new Date("2026-08-03T14:00:00Z"), groupTypeName: "Koszykówka" },
    ];
    const err = new TrainerHasFutureSessionsError(sessions);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TrainerHasFutureSessionsError");
    expect(err.sessions).toHaveLength(2);
    expect(err.message).toMatch(/2 future session/);
  });

  it("single session", () => {
    const sessions = [
      { id: "s1", startTime: new Date("2026-08-01T10:00:00Z"), groupTypeName: "Piłka" },
    ];
    const err = new TrainerHasFutureSessionsError(sessions);
    expect(err.sessions).toHaveLength(1);
    expect(err.message).toMatch(/1 future session/);
  });
});
