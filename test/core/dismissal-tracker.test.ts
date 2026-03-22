import { describe, it, expect } from "vitest";
import {
  createDismissalTracker,
  applyDismissals,
} from "../../src/core/dismissal-tracker.js";
import type { DismissalStore } from "../../src/core/dismissal-tracker.js";
import type { Suggestion } from "../../src/core/types.js";

function makeSuggestion(id: string): Suggestion {
  return { id, text: `Suggestion ${id}`, priority: 1, dismissed: false };
}

describe("applyDismissals", () => {
  it("marks matching suggestions as dismissed", () => {
    const suggestions = [makeSuggestion("a"), makeSuggestion("b")];
    const dismissed = new Set(["a"]);

    const result = applyDismissals(suggestions, dismissed);

    expect(result[0].dismissed).toBe(true);
    expect(result[1].dismissed).toBe(false);
  });

  it("does not mutate the original array", () => {
    const suggestions = [makeSuggestion("a")];
    const dismissed = new Set(["a"]);

    const result = applyDismissals(suggestions, dismissed);

    expect(result).not.toBe(suggestions);
    expect(suggestions[0].dismissed).toBe(false);
  });

  it("returns all suggestions unchanged when no dismissals", () => {
    const suggestions = [makeSuggestion("a"), makeSuggestion("b")];
    const dismissed = new Set<string>();

    const result = applyDismissals(suggestions, dismissed);

    expect(result.every((s) => !s.dismissed)).toBe(true);
  });

  it("handles dismissed IDs that don't match any suggestion", () => {
    const suggestions = [makeSuggestion("a")];
    const dismissed = new Set(["nonexistent"]);

    const result = applyDismissals(suggestions, dismissed);

    expect(result[0].dismissed).toBe(false);
  });

  it("handles empty suggestions array", () => {
    const result = applyDismissals([], new Set(["a"]));
    expect(result).toEqual([]);
  });
});

describe("createDismissalTracker", () => {
  it("starts with no dismissals", () => {
    const tracker = createDismissalTracker();

    const suggestions = [makeSuggestion("a")];
    const result = tracker.apply(suggestions);

    expect(result[0].dismissed).toBe(false);
  });

  it("tracks dismissed suggestion IDs", () => {
    const tracker = createDismissalTracker();
    tracker.dismiss("a");

    const suggestions = [makeSuggestion("a"), makeSuggestion("b")];
    const result = tracker.apply(suggestions);

    expect(result[0].dismissed).toBe(true);
    expect(result[1].dismissed).toBe(false);
  });

  it("dismissing the same ID twice is idempotent", () => {
    const tracker = createDismissalTracker();
    tracker.dismiss("a");
    tracker.dismiss("a");

    const suggestions = [makeSuggestion("a")];
    const result = tracker.apply(suggestions);

    expect(result[0].dismissed).toBe(true);
  });

  it("can clear all dismissals", () => {
    const tracker = createDismissalTracker();
    tracker.dismiss("a");
    tracker.dismiss("b");
    tracker.clear();

    const suggestions = [makeSuggestion("a"), makeSuggestion("b")];
    const result = tracker.apply(suggestions);

    expect(result.every((s) => !s.dismissed)).toBe(true);
  });

  it("loads initial state from a DismissalStore", () => {
    const store: DismissalStore = {
      load: () => ["a", "b"],
      save: () => {},
    };

    const tracker = createDismissalTracker(store);
    const result = tracker.apply([makeSuggestion("a"), makeSuggestion("c")]);

    expect(result[0].dismissed).toBe(true);
    expect(result[1].dismissed).toBe(false);
  });

  it("persists dismissals to store on dismiss", () => {
    const saved: string[][] = [];
    const store: DismissalStore = {
      load: () => [],
      save: (ids) => saved.push(ids),
    };

    const tracker = createDismissalTracker(store);
    tracker.dismiss("x");

    expect(saved).toHaveLength(1);
    expect(saved[0]).toContain("x");
  });

  it("persists to store on clear", () => {
    const saved: string[][] = [];
    const store: DismissalStore = {
      load: () => ["a"],
      save: (ids) => saved.push(ids),
    };

    const tracker = createDismissalTracker(store);
    tracker.clear();

    expect(saved[saved.length - 1]).toEqual([]);
  });

  // ─── Auto-expiry ───────────────────────────────────────────────

  it("auto-expires dismissed IDs when suggestion is no longer present", () => {
    const tracker = createDismissalTracker();
    tracker.dismiss("close-lock-file");

    // First apply — lock file is still open
    const r1 = tracker.apply([makeSuggestion("close-lock-file")]);
    expect(r1[0].dismissed).toBe(true);

    // Lock file was closed — suggestion no longer generated
    tracker.apply([]);

    // Lock file reopened — suggestion should reappear undismissed
    const r2 = tracker.apply([makeSuggestion("close-lock-file")]);
    expect(r2[0].dismissed).toBe(false);
  });

  it("keeps dismissals that are still active in current suggestions", () => {
    const tracker = createDismissalTracker();
    tracker.dismiss("a");
    tracker.dismiss("b");

    // "a" is still present, "b" is gone
    const result = tracker.apply([makeSuggestion("a")]);
    expect(result[0].dismissed).toBe(true);

    // "b" should be pruned — re-adding it should not be dismissed
    const result2 = tracker.apply([makeSuggestion("a"), makeSuggestion("b")]);
    expect(result2[0].dismissed).toBe(true); // "a" still dismissed
    expect(result2[1].dismissed).toBe(false); // "b" expired and came back
  });

  it("persists to store when pruning expired dismissals", () => {
    const saved: string[][] = [];
    const store: DismissalStore = {
      load: () => ["a", "b"],
      save: (ids) => saved.push([...ids]),
    };

    const tracker = createDismissalTracker(store);
    // "a" is present, "b" is not → "b" should be pruned
    tracker.apply([makeSuggestion("a")]);

    expect(saved.length).toBeGreaterThanOrEqual(1);
    const lastSave = saved[saved.length - 1];
    expect(lastSave).toContain("a");
    expect(lastSave).not.toContain("b");
  });
});
