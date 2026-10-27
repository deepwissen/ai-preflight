import * as esbuild from "esbuild";

const isProduction = process.argv.includes("--production");
const isWatch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: !isProduction,
  minify: isProduction,
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ["src/ui/app.tsx"],
  bundle: true,
  outfile: "dist/webview.js",
  // IIFE (a classic script), NOT esm: a webview loaded with <script type="module">
  // is fetched as a CORS request from the webview resource origin and runs
  // deferred. Newer VS Code (newer Electron/Chromium) enforces that strictly and
  // the module fetch can fail → a blank panel. A classic script is not subject to
  // CORS and matches VS Code's canonical webview pattern. The bundle is fully
  // self-contained (no imports), so IIFE output is behaviorally identical.
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: !isProduction,
  minify: isProduction,
  jsx: "automatic",
  jsxImportSource: "preact",
};

async function main() {
  if (isWatch) {
    const extCtx = await esbuild.context(extensionConfig);
    const webCtx = await esbuild.context(webviewConfig);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log("[watch] Build started — watching for changes...");
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
    console.log(
      `[build] Done (${isProduction ? "production" : "development"})`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
