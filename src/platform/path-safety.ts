import { posix } from "node:path";

/**
 * Pure, platform-independent workspace-containment check — the security
 * decision behind action-executor's file writes. Action args round-trip
 * through the webview, so a name like "../../etc/x" must never resolve to a
 * path outside the workspace root before we write to it.
 *
 * Mirrors `vscode.Uri.joinPath` (which is `path.posix.join` over the uri path)
 * so the decision made here matches what the real API would resolve. Keeping it
 * free of `vscode` lets it be unit-tested directly; the Tier-2 host smoke test
 * validates this against the real Uri semantics.
 *
 * @param rootPath   the workspace folder path (posix, e.g. `folder.uri.path`)
 * @param fileName   the untrusted, webview-supplied relative name
 * @returns the resolved posix path if it stays within the root, else `null`
 */
export function resolveWithinRoot(rootPath: string, fileName: string): string | null {
  const target = posix.join(rootPath, fileName); // join on the original path (matches Uri.joinPath)
  const root = rootPath.replace(/\/+$/, ""); // strip trailing slash for the comparison only
  // Must be the root itself or a descendant segment of it — reject escapes.
  if (target !== root && !target.startsWith(root + "/")) {
    return null;
  }
  return target;
}
