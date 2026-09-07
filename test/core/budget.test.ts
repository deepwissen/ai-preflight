import { describe, it, expect } from "vitest";
import {
  DEFAULT_BUDGET_THRESHOLDS,
  classifyBudget,
  midpointTokens,
  budgetBandToRisk,
} from "../../src/core/budget.js";
import type { BudgetThresholds } from "../../src/core/types.js";

describe("budget — DEFAULT_BUDGET_THRESHOLDS", () => {
  it("uses the documented absolute defaults", () => {
    expect(DEFAULT_BUDGET_THRESHOLDS.heavy).toBe(25_000);
    expect(DEFAULT_BUDGET_THRESHOLDS.bloated).toBe(75_000);
  });

  it("keeps heavy strictly below bloated", () => {
    expect(DEFAULT_BUDGET_THRESHOLDS.heavy).toBeLessThan(DEFAULT_BUDGET_THRESHOLDS.bloated);
  });
});

describe("budget — classifyBudget", () => {
  const t = DEFAULT_BUDGET_THRESHOLDS;

  it("classifies well below heavy as lean", () => {
    expect(classifyBudget(0, t)).toBe("lean");
    expect(classifyBudget(10_000, t)).toBe("lean");
  });

  it("treats one token below heavy as lean (boundary)", () => {
    expect(classifyBudget(24_999, t)).toBe("lean");
  });

  it("treats exactly heavy as heavy (inclusive boundary)", () => {
    expect(classifyBudget(25_000, t)).toBe("heavy");
  });

  it("classifies mid-range as heavy", () => {
    expect(classifyBudget(50_000, t)).toBe("heavy");
  });

  it("treats one token below bloated as heavy (boundary)", () => {
    expect(classifyBudget(74_999, t)).toBe("heavy");
  });

  it("treats exactly bloated as bloated (inclusive boundary)", () => {
    expect(classifyBudget(75_000, t)).toBe("bloated");
  });

  it("classifies far above bloated as bloated", () => {
    expect(classifyBudget(500_000, t)).toBe("bloated");
  });

  it("treats zero and negative token counts as lean", () => {
    expect(classifyBudget(0, t)).toBe("lean");
    expect(classifyBudget(-100, t)).toBe("lean");
  });

  it("respects custom thresholds", () => {
    const custom: BudgetThresholds = { heavy: 1_000, bloated: 2_000 };
    expect(classifyBudget(999, custom)).toBe("lean");
    expect(classifyBudget(1_000, custom)).toBe("heavy");
    expect(classifyBudget(1_999, custom)).toBe("heavy");
    expect(classifyBudget(2_000, custom)).toBe("bloated");
  });
});

describe("budget — midpointTokens", () => {
  it("returns the arithmetic midpoint of the range", () => {
    expect(midpointTokens({ low: 100, high: 200 })).toBe(150);
  });

  it("rounds half up", () => {
    expect(midpointTokens({ low: 100, high: 201 })).toBe(151); // 150.5 -> 151
  });

  it("handles equal low and high", () => {
    expect(midpointTokens({ low: 4_000, high: 4_000 })).toBe(4_000);
  });

  it("returns 0 for an empty estimate", () => {
    expect(midpointTokens({ low: 0, high: 0 })).toBe(0);
  });
});

describe("budget — budgetBandToRisk", () => {
  it("maps bloated to high risk", () => {
    expect(budgetBandToRisk("bloated")).toBe("high");
  });

  it("maps heavy to medium risk", () => {
    expect(budgetBandToRisk("heavy")).toBe("medium");
  });

  it("maps lean to low risk", () => {
    expect(budgetBandToRisk("lean")).toBe("low");
  });
});

describe("budget — integration: midpoint -> classify -> risk", () => {
  const t = DEFAULT_BUDGET_THRESHOLDS;

  it("a lean estimate ends at low risk", () => {
    const mid = midpointTokens({ low: 8_000, high: 12_000 }); // 10_000
    expect(budgetBandToRisk(classifyBudget(mid, t))).toBe("low");
  });

  it("a heavy estimate ends at medium risk", () => {
    const mid = midpointTokens({ low: 40_000, high: 60_000 }); // 50_000
    expect(budgetBandToRisk(classifyBudget(mid, t))).toBe("medium");
  });

  it("a bloated estimate ends at high risk", () => {
    const mid = midpointTokens({ low: 80_000, high: 120_000 }); // 100_000
    expect(budgetBandToRisk(classifyBudget(mid, t))).toBe("high");
  });
});
