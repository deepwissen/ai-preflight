// ─── Context Snapshot ─────────────────────────────────────────────
// Represents the IDE state at a point in time.
// Built by the platform layer, consumed by the core engine.

export interface ContextSnapshot {
  timestamp: number;
  activeFile: FileInfo | null;
  selection: SelectionInfo | null;
  openTabs: FileInfo[];
  aiInstructionFiles: InstructionFileInfo[];
  toolProfile: ToolProfile | null;
  ignoreFiles: string[];

  // Not yet captured (always default values)
  referencedFiles: FileInfo[];
  terminalContent: TextBlock | null;
  clipboardSize: number | null;
  chatHistoryLength: number;
}

export interface FileInfo {
  path: string; // workspace-relative
  languageId: string;
  lineCount: number;
  charCount: number;
  isActive: boolean;
  isDirty: boolean;
  commentLineCount: number;
  hasConflictMarkers: boolean;
}

export interface SelectionInfo {
  lineCount: number;
  charCount: number;
  text: string; // truncated to MAX_SELECTION_CHARS
}

export interface TextBlock {
  source: "terminal" | "clipboard" | "pasted";
  lineCount: number;
  charCount: number;
  preview: string; // first 500 chars
}

// ─── AI Tool Profile ─────────────────────────────────────────────

export type AiToolId =
  | "claude-code"
  | "cursor"
  | "copilot"
  | "windsurf"
  | "amazon-q"
  | "gemini"
  | "chatgpt";

export interface ToolProfile {
  toolId: AiToolId;
  modelId?: string;
  detectedVia: "setting" | "auto";
}

export interface InstructionFileInfo {
  path: string;
  lineCount: number;
  toolId: AiToolId | null;
}

// ─── Analysis Result ──────────────────────────────────────────────
// Output of the analysis pipeline. Consumed by the UI layer.

export interface AnalysisResult {
  timestamp: number;
  tokenEstimate: TokenEstimate;
  riskLevel: RiskLevel;
  wastePatterns: WastePattern[];
  positiveSignals: PositiveSignal[];
  taskType: TaskType | null;
  modelSuggestion: ModelSuggestion | null;
  suggestions: Suggestion[];
  contextSummary: ContextSummary;
  tokenBreakdown: FileTokenBreakdown[];
  contextWindowUsage: ContextWindowUsage | null;
  toolAnnotations: Record<string, WasteAnnotation>;
  instructionFileIssues: InstructionFileIssue[];
  outcomeInsights?: OutcomeInsights;
}

export interface ContextWindowUsage {
  toolId: AiToolId;
  toolDisplayName: string;
  contextWindowTokens: number;
  estimatedUsagePercent: number;
  estimatedTokens: number;
}

export interface WasteAnnotation {
  suppressed: boolean;
  reason: string;
}

export interface InstructionFileIssue {
  id: string;
  filePath: string;
  issue: "empty" | "too-short" | "too-long" | "missing";
  lineCount?: number;
  description: string;
  suggestion: string;
}

export interface PositiveSignal {
  id: string;
  label: string;
  description: string;
}

export interface ContextSummary {
  activeFileName: string | null;
  selectionLines: number | null;
  openTabCount: number;
  openTabNames: string[];
}

export interface TokenEstimate {
  low: number;
  high: number;
  band: TokenBand;
  /** How much of the actual context we can observe.
   *  - "low": uncertain content included (terminal, clipboard)
   *  - "medium": only active file visible
   *  - "high": multiple sources visible (4+ tabs or referenced files)
   */
  confidence: ConfidenceLevel;
}

export interface FileTokenBreakdown {
  source: "active-file" | "tab" | "selection-override" | "referenced-file" | "terminal";
  path: string;
  estimatedTokens: { low: number; high: number };
  percentage: number; // 0-100
}

export interface WastePattern {
  ruleId: string;
  source: string;
  description: string;
  severity: "info" | "warning";
  suggestion: string;
}

export interface ModelSuggestion {
  recommendedClass: ModelClass;
  reason: string;
  confidence: ConfidenceLevel;
}

export interface SuggestionAction {
  command: string;
  args?: Record<string, unknown>;
  label: string;
}

export interface Suggestion {
  id: string;
  text: string;
  priority: number; // 1 = highest
  dismissed: boolean;
  action?: SuggestionAction;
}

// ─── Outcome Intelligence ────────────────────────────────────────

export interface OutcomeSignal {
  type: "re-prompt" | "undo" | "repeated-edit" | "conversation-reset";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AnalysisSnapshot {
  timestamp: number;
  riskLevel: RiskLevel;
  wastePatternIds: string[];
  suggestionIds: string[];
  dismissedSuggestionIds: string[];
  actedSuggestionIds: string[];
}

export interface SessionRecord {
  id: string;
  startTimestamp: number;
  endTimestamp: number | null;
  analyses: AnalysisSnapshot[];
  signals: OutcomeSignal[];
}

export interface SessionSummary {
  sessionCount: number;
  totalAnalyses: number;
  totalSignals: number;
  signalsByType: Record<string, number>;
  riskDistribution: Record<RiskLevel, number>;
}

export interface OutcomeCorrelation {
  label: string;
  description: string;
  sampleSize: number;
  value: number;
}

export interface OutcomeInsights {
  summary: SessionSummary;
  correlations: OutcomeCorrelation[];
}

// ─── Prompt Analysis ─────────────────────────────────────────────
// Output of the prompt-aware analyzer. Used only in @preflight chat participant flow.

export interface PromptAnalysis {
  taskType: TaskType | null;
  intentKeywords: string[];
  matchingFiles: string[];
  missingFiles: string[];
  unnecessaryFiles: string[];
  scopeHint: string | null;
  relevantTokenEstimate: { low: number; high: number };
  wastedTokenEstimate: { low: number; high: number };
}

// ─── Enums & Unions ───────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";
export type TokenBand = "low" | "medium" | "high";
export type ConfidenceLevel = "low" | "medium" | "high";
export type ModelClass = "fast" | "coding" | "reasoning";

export type TaskType =
  | "coding"
  | "testing"
  | "debugging"
  | "refactoring"
  | "architecture"
  | "explanation";

// ─── Pipeline ─────────────────────────────────────────────────────

export type AnalyzerStep = (
  context: ContextSnapshot,
  partial: Partial<AnalysisResult>
) => Partial<AnalysisResult>;

// ─── Events ───────────────────────────────────────────────────────

export interface EventMap {
  "context:updated": ContextSnapshot;
  "analysis:complete": AnalysisResult;
  "suggestion:dismissed": string;
  "action:executed": string;
  "outcome:signal": OutcomeSignal;
}

// ─── Constants ────────────────────────────────────────────────────

export const MAX_SELECTION_CHARS = 10_000;
export const DEBOUNCE_MS = 500;
export const TOKEN_BAND_LOW = 2_000;
export const TOKEN_BAND_HIGH = 8_000;
export const CHARS_PER_TOKEN = 4;
