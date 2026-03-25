import type { WorkspaceMatch, WorkspaceMatchReason } from "../types.js";

/**
 * Ranks workspace matches by relevance.
 * Pure function — no vscode imports. Used to sort workspace search results.
 */

const REASON_SCORES: Record<WorkspaceMatchReason, number> = {
  import: 100,
  filename: 80,
  "test-pair": 70,
  nearby: 30,
  content: 20,
};

const CONFIDENCE_BONUS: Record<string, number> = {
  high: 20,
  medium: 10,
  low: 0,
};

const REASON_LABELS: Record<WorkspaceMatchReason, string> = {
  import: "Imported by active file",
  filename: "Filename matches prompt",
  "test-pair": "Test companion",
  nearby: "In same directory",
  content: "Contains keyword",
};

const MIN_DISPLAY_SCORE = 25;

export function scoreMatch(match: WorkspaceMatch): number {
  return (REASON_SCORES[match.reason] ?? 0) + (CONFIDENCE_BONUS[match.confidence] ?? 0);
}

/**
 * Returns a human-friendly label for why this match was found.
 */
export function formatMatchReason(match: WorkspaceMatch): string {
  return REASON_LABELS[match.reason] ?? match.reason;
}

export function rankWorkspaceMatches(matches: WorkspaceMatch[]): WorkspaceMatch[] {
  return [...matches].sort((a, b) => {
    const scoreDiff = scoreMatch(b) - scoreMatch(a);
    if (scoreDiff !== 0) return scoreDiff;
    // Deterministic tiebreaker: alphabetical by path
    return a.path.localeCompare(b.path);
  });
}

/**
 * Ranks, filters, and groups matches into "strongly related" and "possibly related" buckets.
 * Calls rankWorkspaceMatches internally — callers don't need to pre-sort.
 */
export function groupWorkspaceMatches(matches: WorkspaceMatch[]): {
  strong: WorkspaceMatch[];
  possible: WorkspaceMatch[];
} {
  const ranked = rankWorkspaceMatches(matches);
  const strong: WorkspaceMatch[] = [];
  const possible: WorkspaceMatch[] = [];

  for (const m of ranked) {
    if (scoreMatch(m) < MIN_DISPLAY_SCORE) continue;

    if (m.reason === "import" || m.reason === "filename" || m.reason === "test-pair") {
      if (strong.length < 5) {
        strong.push(m);
      }
    } else {
      if (possible.length < 3) {
        possible.push(m);
      }
    }
  }

  return { strong, possible };
}
