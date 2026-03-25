import { describe, it, expect } from "vitest";
import {
  rankWorkspaceMatches,
  groupWorkspaceMatches,
  formatMatchReason,
  scoreMatch,
} from "../../src/core/analyzers/workspace-ranker.js";
import type { WorkspaceMatch } from "../../src/core/types.js";

function makeMatch(overrides: Partial<WorkspaceMatch> = {}): WorkspaceMatch {
  return {
    path: "src/test-file.ts",
    reason: "filename",
    keyword: "test",
    confidence: "medium",
    ...overrides,
  };
}

describe("rankWorkspaceMatches", () => {
  it("ranks import matches above filename matches", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ path: "src/b.ts", reason: "filename" }),
      makeMatch({ path: "src/a.ts", reason: "import" }),
    ];
    const ranked = rankWorkspaceMatches(matches);
    expect(ranked[0].reason).toBe("import");
    expect(ranked[1].reason).toBe("filename");
  });

  it("ranks filename matches above test-pair matches", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ path: "src/b.test.ts", reason: "test-pair" }),
      makeMatch({ path: "src/a.ts", reason: "filename" }),
    ];
    const ranked = rankWorkspaceMatches(matches);
    expect(ranked[0].reason).toBe("filename");
    expect(ranked[1].reason).toBe("test-pair");
  });

  it("ranks test-pair matches above nearby matches", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ path: "src/c.ts", reason: "nearby", confidence: "low" }),
      makeMatch({ path: "src/a.test.ts", reason: "test-pair" }),
    ];
    const ranked = rankWorkspaceMatches(matches);
    expect(ranked[0].reason).toBe("test-pair");
    expect(ranked[1].reason).toBe("nearby");
  });

  it("ranks nearby matches above content matches", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ path: "src/d.ts", reason: "content", confidence: "low" }),
      makeMatch({ path: "src/c.ts", reason: "nearby", confidence: "low" }),
    ];
    const ranked = rankWorkspaceMatches(matches);
    expect(ranked[0].reason).toBe("nearby");
    expect(ranked[1].reason).toBe("content");
  });

  it("applies confidence bonus correctly", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ path: "src/a.ts", reason: "filename", confidence: "low" }),
      makeMatch({ path: "src/b.ts", reason: "filename", confidence: "high" }),
    ];
    const ranked = rankWorkspaceMatches(matches);
    expect(ranked[0].confidence).toBe("high");
    expect(ranked[1].confidence).toBe("low");
  });

  it("returns empty array for empty input", () => {
    const ranked = rankWorkspaceMatches([]);
    expect(ranked).toEqual([]);
  });

  it("breaks ties deterministically by path (alphabetical)", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ path: "src/z-file.ts", reason: "filename", confidence: "medium" }),
      makeMatch({ path: "src/a-file.ts", reason: "filename", confidence: "medium" }),
      makeMatch({ path: "src/m-file.ts", reason: "filename", confidence: "medium" }),
    ];
    const ranked = rankWorkspaceMatches(matches);
    // All have score 90 — should sort alphabetically by path
    expect(ranked.map((m) => m.path)).toEqual([
      "src/a-file.ts",
      "src/m-file.ts",
      "src/z-file.ts",
    ]);
  });

  it("correctly sorts a large mixed input with tiebreakers", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ path: "src/e.ts", reason: "content", confidence: "low" }),
      makeMatch({ path: "src/d.ts", reason: "nearby", confidence: "low" }),
      makeMatch({ path: "src/b.ts", reason: "filename", confidence: "medium" }),
      makeMatch({ path: "src/a.ts", reason: "import", confidence: "high" }),
      makeMatch({ path: "src/c.test.ts", reason: "test-pair", confidence: "high" }),
    ];
    const ranked = rankWorkspaceMatches(matches);
    // import(120) > filename(90)=test-pair(90) tiebreak by path: b<c > nearby(30) > content(20)
    expect(ranked.map((m) => m.path)).toEqual([
      "src/a.ts",       // import: 120
      "src/b.ts",       // filename: 90, path "b" < "c"
      "src/c.test.ts",  // test-pair: 90
      "src/d.ts",       // nearby: 30
      "src/e.ts",       // content: 20
    ]);
  });

  it("does not mutate the original array", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ path: "src/b.ts", reason: "content", confidence: "low" }),
      makeMatch({ path: "src/a.ts", reason: "import", confidence: "high" }),
    ];
    const original = [...matches];
    rankWorkspaceMatches(matches);
    expect(matches).toEqual(original);
  });
});

describe("formatMatchReason", () => {
  it("returns 'Imported by active file' for import reason", () => {
    expect(formatMatchReason(makeMatch({ reason: "import" }))).toBe("Imported by active file");
  });

  it("returns 'Filename matches prompt' for filename reason", () => {
    expect(formatMatchReason(makeMatch({ reason: "filename" }))).toBe("Filename matches prompt");
  });

  it("returns 'Test companion' for test-pair reason", () => {
    expect(formatMatchReason(makeMatch({ reason: "test-pair" }))).toBe("Test companion");
  });

  it("returns 'In same directory' for nearby reason", () => {
    expect(formatMatchReason(makeMatch({ reason: "nearby" }))).toBe("In same directory");
  });

  it("returns 'Contains keyword' for content reason", () => {
    expect(formatMatchReason(makeMatch({ reason: "content" }))).toBe("Contains keyword");
  });
});

describe("scoreMatch", () => {
  it("scores import + high as 120", () => {
    expect(scoreMatch(makeMatch({ reason: "import", confidence: "high" }))).toBe(120);
  });

  it("scores content + low as 20", () => {
    expect(scoreMatch(makeMatch({ reason: "content", confidence: "low" }))).toBe(20);
  });

  it("scores nearby + low as 30", () => {
    expect(scoreMatch(makeMatch({ reason: "nearby", confidence: "low" }))).toBe(30);
  });
});

describe("groupWorkspaceMatches", () => {
  it("groups import/filename/test-pair as strong", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ reason: "import" }),
      makeMatch({ reason: "filename" }),
      makeMatch({ reason: "test-pair" }),
    ];
    const { strong, possible } = groupWorkspaceMatches(matches);
    expect(strong.length).toBe(3);
    expect(possible.length).toBe(0);
  });

  it("groups nearby as possible (above min threshold)", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ reason: "nearby", confidence: "low" }),
    ];
    const { strong, possible } = groupWorkspaceMatches(matches);
    expect(strong.length).toBe(0);
    expect(possible.length).toBe(1);
  });

  it("filters out low-confidence content matches (below min threshold)", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ reason: "content", confidence: "low" }),
    ];
    // content(20) + low(0) = 20, below MIN_DISPLAY_SCORE of 25
    const { strong, possible } = groupWorkspaceMatches(matches);
    expect(strong.length).toBe(0);
    expect(possible.length).toBe(0);
  });

  it("keeps medium-confidence content matches (above min threshold)", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ reason: "content", confidence: "medium" }),
    ];
    // content(20) + medium(10) = 30, above MIN_DISPLAY_SCORE of 25
    const { strong, possible } = groupWorkspaceMatches(matches);
    expect(possible.length).toBe(1);
  });

  it("caps strong at 5 and possible at 3", () => {
    const matches: WorkspaceMatch[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeMatch({ path: `src/s${i}.ts`, reason: "import" })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeMatch({ path: `src/p${i}.ts`, reason: "nearby" })
      ),
    ];
    const { strong, possible } = groupWorkspaceMatches(matches);
    expect(strong.length).toBe(5);
    expect(possible.length).toBe(3);
  });

  it("returns empty groups for empty input", () => {
    const { strong, possible } = groupWorkspaceMatches([]);
    expect(strong).toEqual([]);
    expect(possible).toEqual([]);
  });

  it("ranks internally — unranked input produces ranked output", () => {
    const matches: WorkspaceMatch[] = [
      makeMatch({ path: "src/z.ts", reason: "filename", confidence: "medium" }),
      makeMatch({ path: "src/a.ts", reason: "import", confidence: "high" }),
    ];
    const { strong } = groupWorkspaceMatches(matches);
    // Should be ranked: import first, then filename
    expect(strong[0].reason).toBe("import");
    expect(strong[1].reason).toBe("filename");
  });
});
