import { describe, expect, it } from "vitest";

// Pure error classes — no env/server dependency.
class GroupTypeDeactivationBlockedError extends Error {
  override name = "GroupTypeDeactivationBlockedError";
  readonly blocks: { kind: string }[];
  constructor(blocks: { kind: string }[]) {
    super(`Group type deactivation blocked: ${blocks.map((b) => b.kind).join(", ")}`);
    this.blocks = blocks;
  }
}
class GroupTypeNotFoundError extends Error {
  override name = "GroupTypeNotFoundError";
  constructor() { super("Group type not found"); }
}

describe("GroupTypeDeactivationBlockedError", () => {
  it("carries blocks", () => {
    const err = new GroupTypeDeactivationBlockedError([
      { kind: "has-active-recurrences" },
      { kind: "has-future-sessions" },
    ]);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GroupTypeDeactivationBlockedError");
    expect(err.blocks).toHaveLength(2);
    expect(err.message).toMatch(/has-active-recurrences/);
    expect(err.message).toMatch(/has-future-sessions/);
  });

  it("single block", () => {
    const err = new GroupTypeDeactivationBlockedError([
      { kind: "has-active-recurrences" },
    ]);
    expect(err.blocks).toHaveLength(1);
    expect(err.message).toMatch(/has-active-recurrences/);
  });
});

describe("GroupTypeNotFoundError", () => {
  it("name and message", () => {
    const err = new GroupTypeNotFoundError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GroupTypeNotFoundError");
    expect(err.message).toMatch(/not found/i);
  });
});
