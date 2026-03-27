import * as vscode from "vscode";
import type {
  ContextSnapshot,
  FileInfo,
  SelectionInfo,
  InstructionFileInfo,
  ToolProfile,
  AiToolId,
} from "../core/types.js";
import { MAX_SELECTION_CHARS, DEBOUNCE_MS } from "../core/types.js";
import { EventBus } from "../core/event-bus.js";


const CONFLICT_MARKER_PATTERN = /^<{7}\s|^={7}$|^>{7}\s/m;

/**
 * Bridges VS Code APIs to a platform-independent ContextSnapshot.
 * This is the ONLY place that imports `vscode` in the context collection flow.
 */
export class ContextBridge {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private disposables: vscode.Disposable[] = [];
  private aiInstructionFilesCache: InstructionFileInfo[] = [];
  private ignoreFilesCache: string[] = [];
  private toolProfileCache: ToolProfile | null = null;
  private editCounts = new Map<string, { count: number; lastTimestamp: number }>();
  private static readonly EDIT_FREQUENCY_THRESHOLD = 5;
  private static readonly EDIT_WINDOW_MS = 60_000;

  constructor(private eventBus: EventBus) {}

  /** Start listening to IDE state changes. */
  activate(): void {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleUpdate()),
      vscode.window.onDidChangeTextEditorSelection(() => this.scheduleUpdate()),
      vscode.window.tabGroups.onDidChangeTabs(() => this.scheduleUpdate()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.detectAiInstructionFiles();
        void this.detectIgnoreFiles();
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("ai-preflight")) {
          this.resolveToolProfile();
          this.scheduleUpdate();
        }
      }),
      // Outcome intelligence: track undo and repeated-edit signals
      vscode.workspace.onDidChangeTextDocument((e) => {
        // Detect undo operations
        if (e.contentChanges.length > 0 && e.reason === vscode.TextDocumentChangeReason.Undo) {
          this.eventBus.emit("outcome:signal", {
            type: "undo",
            timestamp: Date.now(),
            metadata: { file: vscode.workspace.asRelativePath(e.document.uri) },
          });
        }

        // Track repeated edits to the same file
        const filePath = vscode.workspace.asRelativePath(e.document.uri);
        const existing = this.editCounts.get(filePath);
        const now = Date.now();
        if (existing && now - existing.lastTimestamp < ContextBridge.EDIT_WINDOW_MS) {
          existing.count++;
          existing.lastTimestamp = now;
          if (existing.count >= ContextBridge.EDIT_FREQUENCY_THRESHOLD) {
            this.eventBus.emit("outcome:signal", {
              type: "repeated-edit",
              timestamp: now,
              metadata: { file: filePath, editCount: existing.count },
            });
            existing.count = 0;
          }
        } else {
          this.editCounts.set(filePath, { count: 1, lastTimestamp: now });
        }
      })
    );

    // Resolve tool profile from settings
    this.resolveToolProfile();

    // Detect AI instruction files and ignore files (cached, refreshed on workspace folder change)
    void this.detectAiInstructionFiles();
    void this.detectIgnoreFiles();

    // Initial capture
    this.captureAndEmit();
  }

  /** Stop listening and clean up. */
  deactivate(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  /** Capture current IDE state immediately (for manual analyze command). */
  captureNow(): ContextSnapshot {
    return this.capture();
  }

  private scheduleUpdate(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.captureAndEmit(), DEBOUNCE_MS);
  }

  private captureAndEmit(): void {
    const snapshot = this.capture();
    this.eventBus.emit("context:updated", snapshot);
  }

  private capture(): ContextSnapshot {
    const editor = vscode.window.activeTextEditor;

    return {
      timestamp: Date.now(),
      activeFile: editor ? this.getFileInfo(editor.document, true) : null,
      selection: editor ? this.getSelection(editor) : null,
      openTabs: this.getOpenTabs(),
      referencedFiles: [],
      terminalContent: null,
      clipboardSize: null,
      chatHistoryLength: 0,
      aiInstructionFiles: this.aiInstructionFilesCache,
      toolProfile: this.toolProfileCache,
      ignoreFiles: this.ignoreFilesCache,
    };
  }

  private getFileInfo(doc: vscode.TextDocument, isActive: boolean): FileInfo {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const relativePath = workspaceFolder ? vscode.workspace.asRelativePath(doc.uri) : doc.fileName;

    const text = doc.getText();
    let commentLineCount = 0;
    let hasConflictMarkers = false;

    if (isActive) {
      commentLineCount = this.countCommentLines(text, doc.languageId);
      hasConflictMarkers = CONFLICT_MARKER_PATTERN.test(text);
    }

    return {
      path: relativePath,
      languageId: doc.languageId,
      lineCount: doc.lineCount,
      charCount: text.length,
      isActive,
      isDirty: doc.isDirty,
      commentLineCount,
      hasConflictMarkers,
    };
  }

  private getSelection(editor: vscode.TextEditor): SelectionInfo | null {
    const sel = editor.selection;
    if (sel.isEmpty) return null;

    const text = editor.document.getText(sel);
    const lineCount = sel.end.line - sel.start.line + 1;

    return {
      lineCount,
      charCount: text.length,
      text: text.slice(0, MAX_SELECTION_CHARS),
    };
  }

  private getOpenTabs(): FileInfo[] {
    const tabs: FileInfo[] = [];

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          const uri = tab.input.uri;
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          const relativePath = workspaceFolder ? vscode.workspace.asRelativePath(uri) : uri.fsPath;

          // Check if document is already loaded in memory (no disk I/O)
          const doc = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === uri.toString()
          );

          // Always estimate charCount in getOpenTabs — the active file's accurate
          // charCount is already captured in getFileInfo(). Avoids redundant getText().
          const lineCount = doc?.lineCount ?? 0;
          const charCount = doc ? doc.lineCount * 40 : 0;

          tabs.push({
            path: relativePath,
            languageId: doc?.languageId ?? "",
            lineCount,
            charCount,
            isActive: tab.isActive,
            isDirty: doc?.isDirty ?? false,
            commentLineCount: 0, // Only computed for active file
            hasConflictMarkers: false, // Only computed for active file
          });
        }
      }
    }

    return tabs;
  }

  /** Map glob patterns to the tool that owns them. */
  private static readonly INSTRUCTION_FILE_PATTERNS: Array<{ pattern: string; toolId: AiToolId }> =
    [
      { pattern: "**/.cursorrules", toolId: "cursor" },
      { pattern: "**/.cursor/rules/**", toolId: "cursor" },
      { pattern: "**/.github/copilot-instructions.md", toolId: "copilot" },
      { pattern: "**/CLAUDE.md", toolId: "claude-code" },
      { pattern: "**/.windsurfrules", toolId: "windsurf" },
      { pattern: "**/.amazonq/rules/**", toolId: "amazon-q" },
      { pattern: "**/GEMINI.md", toolId: "gemini" },
    ];

  private static readonly IGNORE_FILE_PATTERNS = [
    "**/.claudeignore",
    "**/.cursorignore",
    "**/.codeiumignore",
  ];

  private async detectAiInstructionFiles(): Promise<void> {
    const files: InstructionFileInfo[] = [];
    for (const { pattern, toolId } of ContextBridge.INSTRUCTION_FILE_PATTERNS) {
      try {
        const found = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 5);
        for (const uri of found) {
          const relativePath = vscode.workspace.asRelativePath(uri);
          let lineCount = 0;
          try {
            const doc = await vscode.workspace.openTextDocument(uri);
            lineCount = doc.lineCount;
          } catch {
            // File may not be readable
          }
          files.push({ path: relativePath, lineCount, toolId });
        }
      } catch (err) {
        console.warn(`[AI Preflight] Failed to search for ${pattern}:`, err);
      }
    }
    this.aiInstructionFilesCache = files;
  }

  private async detectIgnoreFiles(): Promise<void> {
    const ignoreFiles: string[] = [];
    for (const pattern of ContextBridge.IGNORE_FILE_PATTERNS) {
      try {
        const found = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 1);
        if (found.length > 0) {
          const name = vscode.workspace.asRelativePath(found[0]);
          ignoreFiles.push(name);
        }
      } catch {
        // ignore
      }
    }
    this.ignoreFilesCache = ignoreFiles;
  }

  /** Extension ID → AI tool mapping for auto-detection. */
  private static readonly EXTENSION_TOOL_MAP: Array<{ extensionId: string; toolId: AiToolId }> = [
    { extensionId: "github.copilot", toolId: "copilot" },
    { extensionId: "codeium.codeium", toolId: "windsurf" },
    { extensionId: "amazonwebservices.amazon-q-vscode", toolId: "amazon-q" },
    { extensionId: "google.gemini", toolId: "gemini" },
  ];

  private resolveToolProfile(): void {
    const config = vscode.workspace.getConfiguration("ai-preflight");
    const toolSetting = config.get<string>("aiTool", "auto");
    const modelSetting = config.get<string>("aiModel", "");

    if (toolSetting && toolSetting !== "auto") {
      this.toolProfileCache = {
        toolId: toolSetting as AiToolId,
        detectedVia: "setting",
        ...(modelSetting ? { modelId: modelSetting } : {}),
      };
      return;
    }

    // Auto-detect from installed extensions
    for (const { extensionId, toolId } of ContextBridge.EXTENSION_TOOL_MAP) {
      if (vscode.extensions.getExtension(extensionId)) {
        this.toolProfileCache = { toolId, detectedVia: "auto" };
        return;
      }
    }

    // Fallback: check cached instruction files for tool hints
    for (const file of this.aiInstructionFilesCache) {
      if (file.toolId) {
        this.toolProfileCache = { toolId: file.toolId, detectedVia: "auto" };
        return;
      }
    }

    this.toolProfileCache = null;
  }

  // Languages where # starts a line comment
  private static readonly HASH_COMMENT_LANGUAGES = new Set([
    "python",
    "ruby",
    "shellscript",
    "yaml",
    "perl",
    "r",
    "coffeescript",
    "makefile",
    "dockerfile",
    "toml",
  ]);

  private countCommentLines(text: string, languageId: string): number {
    const lines = text.split("\n");
    let count = 0;
    let inBlockComment = false;
    const hashIsComment = ContextBridge.HASH_COMMENT_LANGUAGES.has(languageId);

    for (const line of lines) {
      const trimmed = line.trim();

      if (inBlockComment) {
        count++;
        if (trimmed.includes("*/")) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed.startsWith("//")) {
        count++;
      } else if (hashIsComment && trimmed.startsWith("#")) {
        count++;
      } else if (trimmed.startsWith("/*")) {
        count++;
        if (!trimmed.includes("*/")) {
          inBlockComment = true;
        }
      }
    }

    return count;
  }
}
