import { describe, expect, it } from "vitest";

import type { MassReassignReport } from "./mass-reassign-trainer";

describe("MassReassignReport", () => {
  it("all updated", () => {
    const report: MassReassignReport = { total: 5, updated: 5, skippedTrainerConflict: 0 };
    expect(report.total).toBe(5);
    expect(report.updated).toBe(5);
    expect(report.skippedTrainerConflict).toBe(0);
  });

  it("partial success", () => {
    const report: MassReassignReport = { total: 5, updated: 3, skippedTrainerConflict: 2 };
    expect(report.total).toBe(5);
    expect(report.updated).toBe(3);
    expect(report.skippedTrainerConflict).toBe(2);
  });

  it("all skipped", () => {
    const report: MassReassignReport = { total: 3, updated: 0, skippedTrainerConflict: 3 };
    expect(report.total).toBe(3);
    expect(report.updated).toBe(0);
    expect(report.skippedTrainerConflict).toBe(3);
  });
});
