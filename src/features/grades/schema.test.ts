import { describe, expect, it } from "vitest";

import { createGradeFieldSchema } from "./schema";
import type { NamespaceTranslator } from "@/lib/i18n";

/**
 * Grade field validation (langlion §2.33, EPIK 35, v16, Faza 6).
 *
 * Unit-tested rather than clicked: the XOR between `groupTypeId`/`sessionId` and
 * the min/max ordering are pure logic the zod layer enforces BEFORE the request
 * ever reaches `grade_field_owner_ck` at the database — same reasoning as
 * `payment-options.test.ts`.
 */

// A stub translator: message content does not matter to these assertions, only
// whether validation passes or fails.
const t = ((key: string) => key) as NamespaceTranslator<"grades.validation">;

describe("createGradeFieldSchema — scope XOR", () => {
  it("accepts a group_type-scoped field with only groupTypeId set", () => {
    const result = createGradeFieldSchema(t).safeParse({
      name: "Ocena ogólna",
      fieldType: "numeric",
      scope: "group_type",
      groupTypeId: "gt-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a session-scoped field with only sessionId set", () => {
    const result = createGradeFieldSchema(t).safeParse({
      name: "Test wyjątkowy",
      fieldType: "text",
      scope: "session",
      sessionId: "cs-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects scope=group_type with no groupTypeId", () => {
    const result = createGradeFieldSchema(t).safeParse({
      name: "x",
      fieldType: "text",
      scope: "group_type",
    });
    expect(result.success).toBe(false);
  });

  it("rejects scope=session with no sessionId", () => {
    const result = createGradeFieldSchema(t).safeParse({
      name: "x",
      fieldType: "text",
      scope: "session",
    });
    expect(result.success).toBe(false);
  });
});

describe("createGradeFieldSchema — min/max ordering", () => {
  it("accepts minValue <= maxValue", () => {
    const result = createGradeFieldSchema(t).safeParse({
      name: "Skala",
      fieldType: "scale",
      scope: "session",
      sessionId: "cs-1",
      minValue: 1,
      maxValue: 6,
    });
    expect(result.success).toBe(true);
  });

  it("rejects minValue > maxValue", () => {
    const result = createGradeFieldSchema(t).safeParse({
      name: "Skala",
      fieldType: "scale",
      scope: "session",
      sessionId: "cs-1",
      minValue: 6,
      maxValue: 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a field type with neither bound set", () => {
    const result = createGradeFieldSchema(t).safeParse({
      name: "Komentarz",
      fieldType: "text",
      scope: "session",
      sessionId: "cs-1",
    });
    expect(result.success).toBe(true);
  });
});
