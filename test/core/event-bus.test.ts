import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../src/core/event-bus.js";

describe("EventBus", () => {
  it("emits events to listeners", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on("analysis:complete", handler);
    bus.emit("analysis:complete", {
      timestamp: 1,
      tokenEstimate: { low: 0, high: 0, band: "low", confidence: "low" },
      riskLevel: "low",
      wastePatterns: [],
      positiveSignals: [],
      taskType: null,
      modelSuggestion: null,
      suggestions: [],
      contextSummary: {
        activeFileName: null,
        selectionLines: null,
        openTabCount: 0,
        openTabNames: [],
      },
      tokenBreakdown: [],
      contextWindowUsage: null,
      toolAnnotations: {},
      instructionFileIssues: [],
    });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("supports multiple listeners for the same event", () => {
    const bus = new EventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on("suggestion:dismissed", handler1);
    bus.on("suggestion:dismissed", handler2);
    bus.emit("suggestion:dismissed", "rule-1");

    expect(handler1).toHaveBeenCalledWith("rule-1");
    expect(handler2).toHaveBeenCalledWith("rule-1");
  });

  it("returns an unsubscribe function", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsub = bus.on("suggestion:dismissed", handler);
    unsub();
    bus.emit("suggestion:dismissed", "rule-1");

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not throw when emitting with no listeners", () => {
    const bus = new EventBus();

    expect(() => bus.emit("suggestion:dismissed", "rule-1")).not.toThrow();
  });

  it("catches errors in handlers without affecting other listeners", () => {
    const bus = new EventBus();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const badHandler = () => {
      throw new Error("handler failed");
    };
    const goodHandler = vi.fn();

    bus.on("suggestion:dismissed", badHandler);
    bus.on("suggestion:dismissed", goodHandler);
    bus.emit("suggestion:dismissed", "rule-1");

    expect(goodHandler).toHaveBeenCalledWith("rule-1");
    spy.mockRestore();
  });

  it("clears all listeners with removeAllListeners", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on("suggestion:dismissed", handler);
    bus.removeAllListeners();
    bus.emit("suggestion:dismissed", "rule-1");

    expect(handler).not.toHaveBeenCalled();
  });
});
