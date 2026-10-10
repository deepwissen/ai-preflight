/**
 * Minimal, test-controllable mock of the `vscode` module. Aliased in
 * vitest.config.ts so platform shells resolve to this under test. It is NOT a
 * full host — it models just the surface the shells touch, with faithful
 * Uri/path semantics (backed by node:path.posix, matching Uri.joinPath) so the
 * containment decision validated in path-safety.test.ts holds here too.
 *
 * Tests drive it via the exported `state` object and assert via the recorded
 * arrays (closedTabs, written, shown, executed, registered). Call reset() in
 * beforeEach.
 */
import { posix } from "node:path";

export class Uri {
  constructor(
    public scheme: string,
    public authority: string,
    public path: string
  ) {}
  static file(p: string): Uri {
    return new Uri("file", "", p);
  }
  static parse(s: string): Uri {
    const m = /^(\w+):\/\/([^/]*)(\/.*)?$/.exec(s);
    return m ? new Uri(m[1], m[2], m[3] ?? "") : new Uri("file", "", s);
  }
  static joinPath(base: Uri, ...fragments: string[]): Uri {
    return new Uri(base.scheme, base.authority, posix.join(base.path, ...fragments));
  }
  with(change: { scheme?: string; authority?: string; path?: string }): Uri {
    return new Uri(change.scheme ?? this.scheme, change.authority ?? this.authority, change.path ?? this.path);
  }
  get fsPath(): string {
    return this.path;
  }
  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }
}

export class TabInputText {
  constructor(public uri: Uri) {}
}
export class Position {
  constructor(
    public line: number,
    public character: number
  ) {}
}
export class Selection {
  constructor(
    public start: Position,
    public end: Position
  ) {}
}
export class RelativePattern {
  constructor(
    public base: unknown,
    public pattern: string
  ) {}
}
export class ThemeColor {
  constructor(public id: string) {}
}
export class ThemeIcon {
  constructor(public id: string) {}
}
export class Location {
  constructor(
    public uri: Uri,
    public range: unknown
  ) {}
}
export class Disposable {
  constructor(private cb?: () => void) {}
  dispose(): void {
    this.cb?.();
  }
}

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const SymbolKind = { Function: 11, Method: 5 } as const;
export const TextDocumentChangeReason = { Undo: 1, Redo: 2 } as const;

// ─── Controllable state ───────────────────────────────────────────
interface MockTab {
  input: unknown;
  isActive: boolean;
}
interface MockDoc {
  uri: Uri;
  languageId: string;
  isDirty: boolean;
  lineCount: number;
  getText: () => string;
  save?: () => Promise<boolean>;
}

export const state = {
  workspaceFolders: [] as Array<{ uri: Uri; name: string; index: number }>,
  activeTextEditor: null as null | { document: MockDoc; selection: Selection; revealRange: (r: unknown) => void },
  tabGroups: [] as Array<{ tabs: MockTab[] }>,
  textDocuments: [] as MockDoc[],
  config: {} as Record<string, unknown>,
  extensions: {} as Record<string, unknown>,
  findFilesImpl: null as null | ((include: unknown, exclude: unknown, max?: number, token?: unknown) => Promise<Uri[]>),
  openTextDocumentImpl: null as null | ((uri: Uri) => Promise<MockDoc>),
  executeCommandImpl: null as null | ((cmd: string, ...args: unknown[]) => unknown),
  // recordings
  closedTabs: [] as MockTab[],
  written: [] as Array<{ uri: Uri; content: string }>,
  shown: [] as Array<{ uri: Uri; options?: unknown }>,
  executed: [] as Array<{ command: string; args: unknown[] }>,
  registered: [] as Array<{ id: string; callback: (...a: unknown[]) => unknown }>,
  infoMessages: [] as string[],
};

export function reset(): void {
  state.workspaceFolders = [];
  state.activeTextEditor = null;
  state.tabGroups = [];
  state.textDocuments = [];
  state.config = {};
  state.extensions = {};
  state.findFilesImpl = null;
  state.openTextDocumentImpl = null;
  state.executeCommandImpl = null;
  state.closedTabs = [];
  state.written = [];
  state.shown = [];
  state.executed = [];
  state.registered = [];
  state.infoMessages = [];
  env.clipboard._text = "";
}

function asRelative(input: Uri | string): string {
  const p = typeof input === "string" ? input : input.path;
  const root = state.workspaceFolders[0]?.uri.path;
  if (root && p.startsWith(root + "/")) return p.slice(root.length + 1);
  return p;
}

export const window = {
  get activeTextEditor() {
    return state.activeTextEditor;
  },
  tabGroups: {
    get all() {
      return state.tabGroups;
    },
    async close(tab: MockTab): Promise<void> {
      // Record only — don't mutate the groups mid-iteration; the real
      // tabGroups.all hands handlers a stable snapshot for the pass.
      state.closedTabs.push(tab);
    },
    onDidChangeTabs() {
      return new Disposable();
    },
  },
  async showTextDocument(uri: Uri, options?: unknown): Promise<void> {
    state.shown.push({ uri, options });
  },
  async showInformationMessage(message: string): Promise<undefined> {
    state.infoMessages.push(message);
    return undefined;
  },
  createStatusBarItem() {
    return { text: "", tooltip: "", command: "", color: undefined, backgroundColor: undefined, show() {}, hide() {}, dispose() {} };
  },
  onDidChangeActiveTextEditor() {
    return new Disposable();
  },
  onDidChangeTextEditorSelection() {
    return new Disposable();
  },
};

export const workspace = {
  get workspaceFolders() {
    return state.workspaceFolders.length ? state.workspaceFolders : undefined;
  },
  get textDocuments() {
    return state.textDocuments;
  },
  asRelativePath: asRelative,
  async findFiles(include: unknown, exclude?: unknown, max?: number, token?: unknown): Promise<Uri[]> {
    return state.findFilesImpl ? state.findFilesImpl(include, exclude, max, token) : [];
  },
  async openTextDocument(uri: Uri): Promise<MockDoc> {
    if (state.openTextDocumentImpl) return state.openTextDocumentImpl(uri);
    const doc = state.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (!doc) throw new Error("not found");
    return doc;
  },
  getConfiguration(section: string) {
    return {
      get<T>(key: string, dflt: T): T {
        const v = state.config[`${section}.${key}`];
        return (v === undefined ? dflt : v) as T;
      },
    };
  },
  fs: {
    async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
      state.written.push({ uri, content: Buffer.from(content).toString("utf-8") });
    },
  },
  onDidChangeWorkspaceFolders() {
    return new Disposable();
  },
  onDidChangeConfiguration() {
    return new Disposable();
  },
  onDidSaveTextDocument() {
    return new Disposable();
  },
  onDidChangeTextDocument() {
    return new Disposable();
  },
};

export const commands = {
  async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    state.executed.push({ command, args });
    return state.executeCommandImpl ? state.executeCommandImpl(command, ...args) : undefined;
  },
  registerCommand(id: string, callback: (...a: unknown[]) => unknown): Disposable {
    state.registered.push({ id, callback });
    return new Disposable();
  },
};

export const env = {
  clipboard: {
    _text: "",
    async readText(): Promise<string> {
      return this._text;
    },
    async writeText(t: string): Promise<void> {
      this._text = t;
    },
  },
};

export const extensions = {
  getExtension(id: string): unknown {
    return state.extensions[id];
  },
};
