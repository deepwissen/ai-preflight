import * as vscode from "vscode";

const TEST_FILE_PATTERNS = /\.(test|spec)\.(ts|tsx|js|jsx)$|__tests__\//;

/**
 * Executes 1-click fix actions triggered from the webview.
 * All VS Code API calls for suggestion actions are centralized here.
 */
export async function executeAction(
  command: string,
  args?: Record<string, unknown>
): Promise<void> {
  switch (command) {
    case "ai-preflight.action.closeTabs":
      await closeUnrelatedTabs();
      break;
    case "ai-preflight.action.saveFile":
      await saveActiveFile();
      break;
    case "ai-preflight.action.closeDuplicates":
      await closeDuplicateTabs();
      break;
    case "ai-preflight.action.closeMismatchedLangs":
      await closeMismatchedLanguageTabs();
      break;
    case "ai-preflight.action.focusModule":
      await closeUnrelatedTabs();
      break;
    case "ai-preflight.action.selectFunction":
      await selectFirstFunction();
      break;
    case "ai-preflight.action.createInstructionFile":
      await createInstructionFile(args);
      break;
    case "ai-preflight.action.createIgnoreFile":
      await createIgnoreFile(args);
      break;
    case "ai-preflight.action.closeTab":
      await closeTabByPath(args);
      break;
    case "ai-preflight.action.closeTestFiles":
      await closeTestFiles();
      break;
    default:
      console.warn(`[AI Preflight] Unknown action: ${command}`);
  }
}

async function closeUnrelatedTabs(): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) return;

  const activePath = vscode.workspace.asRelativePath(activeEditor.document.uri);
  const activeModule = getModulePath(activePath);

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && !tab.isActive) {
        const tabPath = vscode.workspace.asRelativePath(tab.input.uri);
        if (getModulePath(tabPath) !== activeModule) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }
  }
}

async function saveActiveFile(): Promise<void> {
  const doc = vscode.window.activeTextEditor?.document;
  if (doc?.isDirty) {
    await doc.save();
  }
}

async function closeDuplicateTabs(): Promise<void> {
  const seen = new Set<string>();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText) {
        const uri = tab.input.uri.toString();
        if (seen.has(uri)) {
          await vscode.window.tabGroups.close(tab);
        } else {
          seen.add(uri);
        }
      }
    }
  }
}

async function closeMismatchedLanguageTabs(): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) return;

  const activeLang = activeEditor.document.languageId;
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && !tab.isActive) {
        const input = tab.input as vscode.TabInputText;
        const doc = vscode.workspace.textDocuments.find(
          (d) => d.uri.toString() === input.uri.toString()
        );
        if (doc && doc.languageId !== activeLang) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }
  }
}

async function selectFirstFunction(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    editor.document.uri
  );

  if (symbols && symbols.length > 0) {
    const firstFunc = findFirstFunction(symbols);
    if (firstFunc) {
      editor.selection = new vscode.Selection(firstFunc.range.start, firstFunc.range.end);
      editor.revealRange(firstFunc.range);
    }
  }
}

function findFirstFunction(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol | undefined {
  for (const s of symbols) {
    if (s.kind === vscode.SymbolKind.Function || s.kind === vscode.SymbolKind.Method) {
      return s;
    }
    // Search nested symbols
    const nested = findFirstFunction(s.children);
    if (nested) return nested;
  }
  return undefined;
}

async function createInstructionFile(args?: Record<string, unknown>): Promise<void> {
  const files = (args?.files as string[]) ?? [];
  if (files.length === 0) return;

  const fileName = files[0];
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const uri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
  const template = `# AI Instructions\n\n## Coding Conventions\n\n- \n\n## Project Rules\n\n- \n`;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(template, "utf-8"));
  await vscode.window.showTextDocument(uri);
}

async function createIgnoreFile(args?: Record<string, unknown>): Promise<void> {
  const fileName = (args?.fileName as string) ?? ".claudeignore";
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const uri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
  const template = `node_modules/\ndist/\nbuild/\n.env*\n`;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(template, "utf-8"));
  await vscode.window.showTextDocument(uri);
}

async function closeTabByPath(args?: Record<string, unknown>): Promise<void> {
  const targetPath = args?.path as string | undefined;
  if (!targetPath) return;

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText) {
        const tabPath = vscode.workspace.asRelativePath(tab.input.uri);
        if (tabPath === targetPath) {
          await vscode.window.tabGroups.close(tab);
          return;
        }
      }
    }
  }
}

async function closeTestFiles(): Promise<void> {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText && !tab.isActive) {
        const tabPath = vscode.workspace.asRelativePath(tab.input.uri);
        if (TEST_FILE_PATTERNS.test(tabPath)) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }
  }
}

function getModulePath(path: string): string {
  const parts = path.split("/");
  return parts.length >= 3 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? ".");
}
