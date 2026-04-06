import type {
  AnalysisResult,
  ContextSnapshot,
  InstructionFileIssue,
  WastePattern,
} from "../types.js";

// Hidden unicode characters that could be used to hide content
/* eslint-disable no-misleading-character-class */
const HIDDEN_UNICODE =
  /[\u200B\u200C\u200D\u2060\u00AD\u034F\u17B4\u17B5\u180E\u2062\u2063\u2064]/g;
/* eslint-enable no-misleading-character-class */
const TAG_CHARS = /[\u{E0001}-\u{E007F}]/gu;

// Bidi override characters that can visually reorder text
const BIDI_OVERRIDES =
  /[\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\u061C\u200E\u200F]/g;

// Suspicious prompt injection patterns
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+(instructions|rules|guidelines)/i,
  /disregard\s+(all\s+)?(above|previous|prior)\s+(instructions|rules)/i,
  /(?:new|override|replace)\s+instructions?\s*:/i,
  /^\s*system\s*:/im,
  /\[]\(https?:\/\/[^)]+\)/, // hidden markdown links
];

/**
 * Scans instruction file content for integrity issues:
 * - Hidden unicode characters
 * - Bidi override characters
 * - Suspicious prompt injection patterns
 *
 * Runs after detectWaste, before scoreRisk.
 */
export function scanInstructionIntegrity(
  context: ContextSnapshot,
  _partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  const wastePatterns: WastePattern[] = [];
  const instructionFileIssues: InstructionFileIssue[] = [];

  for (const file of context.aiInstructionFiles) {
    if (!file.content) continue;

    scanHiddenUnicode(file.path, file.content, wastePatterns, instructionFileIssues);
    scanBidiOverrides(file.path, file.content, wastePatterns, instructionFileIssues);
    scanSuspiciousInstructions(file.path, file.content, wastePatterns, instructionFileIssues);
  }

  return {
    wastePatterns,
    instructionFileIssues,
  };
}

function scanHiddenUnicode(
  filePath: string,
  content: string,
  wastePatterns: WastePattern[],
  issues: InstructionFileIssue[]
): void {
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for hidden unicode
    HIDDEN_UNICODE.lastIndex = 0;
    const hiddenMatch = HIDDEN_UNICODE.exec(line);
    if (hiddenMatch) {
      const codePoint = hiddenMatch[0].codePointAt(0)!.toString(16).toUpperCase();
      addIssue(
        filePath,
        "hidden-unicode",
        i + 1,
        `U+${codePoint}`,
        `Hidden unicode character (U+${codePoint}) in ${fileName(filePath)} line ${i + 1}`,
        "Remove hidden unicode characters — they may be used to hide malicious instructions",
        wastePatterns,
        issues
      );
      return; // One finding per category per file
    }

    // Check for tag characters
    TAG_CHARS.lastIndex = 0;
    const tagMatch = TAG_CHARS.exec(line);
    if (tagMatch) {
      const codePoint = tagMatch[0].codePointAt(0)!.toString(16).toUpperCase();
      addIssue(
        filePath,
        "hidden-unicode",
        i + 1,
        `U+${codePoint}`,
        `Hidden tag character (U+${codePoint}) in ${fileName(filePath)} line ${i + 1}`,
        "Remove hidden unicode characters — they may be used to hide malicious instructions",
        wastePatterns,
        issues
      );
      return;
    }

    // Check for BOM not at position 0
    if (i === 0 && line.length > 0 && line.charCodeAt(0) === 0xfeff) {
      // BOM at position 0 in first line is normal — skip
      continue;
    }
    if (line.includes("\uFEFF")) {
      const pos = line.indexOf("\uFEFF");
      if (i > 0 || pos > 0) {
        addIssue(
          filePath,
          "hidden-unicode",
          i + 1,
          "U+FEFF",
          `Hidden BOM character in ${fileName(filePath)} line ${i + 1}`,
          "Remove hidden unicode characters — they may be used to hide malicious instructions",
          wastePatterns,
          issues
        );
        return;
      }
    }
  }
}

function scanBidiOverrides(
  filePath: string,
  content: string,
  wastePatterns: WastePattern[],
  issues: InstructionFileIssue[]
): void {
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    BIDI_OVERRIDES.lastIndex = 0;
    const match = BIDI_OVERRIDES.exec(lines[i]);
    if (match) {
      const codePoint = match[0].codePointAt(0)!.toString(16).toUpperCase();
      addIssue(
        filePath,
        "bidi-override",
        i + 1,
        `U+${codePoint}`,
        `Bidi override character (U+${codePoint}) in ${fileName(filePath)} line ${i + 1}`,
        "Remove bidi override characters — they can visually hide malicious instructions",
        wastePatterns,
        issues
      );
      return; // One finding per category per file
    }
  }
}

function scanSuspiciousInstructions(
  filePath: string,
  content: string,
  wastePatterns: WastePattern[],
  issues: InstructionFileIssue[]
): void {
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      const match = pattern.exec(lines[i]);
      if (match) {
        addIssue(
          filePath,
          "suspicious-instruction",
          i + 1,
          match[0],
          `Suspicious instruction "${match[0]}" in ${fileName(filePath)} line ${i + 1}`,
          "Review this instruction — it may be a prompt injection attempt",
          wastePatterns,
          issues
        );
        return; // One finding per category per file
      }
    }
  }

  // Also check multiline patterns (hidden markdown links can be on any line)
  // The per-line check above already handles this since our patterns work per-line
}

function addIssue(
  filePath: string,
  issue: InstructionFileIssue["issue"],
  lineNumber: number,
  matchedText: string,
  description: string,
  suggestion: string,
  wastePatterns: WastePattern[],
  issues: InstructionFileIssue[]
): void {
  wastePatterns.push({
    ruleId: issue,
    source: filePath,
    description,
    severity: issue === "suspicious-instruction" ? "info" : "warning",
    suggestion,
  });

  issues.push({
    id: `integrity-${issue}-${filePath}`,
    filePath,
    issue,
    lineNumber,
    matchedText,
    description,
    suggestion,
  });
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
