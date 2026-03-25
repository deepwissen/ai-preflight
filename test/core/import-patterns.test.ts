import { describe, it, expect } from "vitest";
import { IMPORT_PATTERNS, extractImportPaths } from "../../src/core/import-patterns.js";

describe("IMPORT_PATTERNS", () => {
  it("exports an array of regex patterns", () => {
    expect(Array.isArray(IMPORT_PATTERNS)).toBe(true);
    expect(IMPORT_PATTERNS.length).toBeGreaterThan(0);
    for (const p of IMPORT_PATTERNS) {
      expect(p).toBeInstanceOf(RegExp);
    }
  });
});

describe("extractImportPaths", () => {
  it("extracts ES6 default import paths", () => {
    const code = `import foo from './utils/foo';`;
    const paths = extractImportPaths(code);
    expect(paths).toContain("./utils/foo");
  });

  it("extracts ES6 named import paths", () => {
    const code = `import { bar, baz } from '../services/bar';`;
    const paths = extractImportPaths(code);
    expect(paths).toContain("../services/bar");
  });

  it("extracts ES6 namespace import paths", () => {
    const code = `import * as helpers from './helpers';`;
    const paths = extractImportPaths(code);
    expect(paths).toContain("./helpers");
  });

  it("extracts CommonJS require paths", () => {
    const code = `const db = require('./db-connection');`;
    const paths = extractImportPaths(code);
    expect(paths).toContain("./db-connection");
  });

  it("extracts mixed import styles", () => {
    const code = [
      `import { auth } from './auth';`,
      `const logger = require('../utils/logger');`,
      `import type { Config } from './config';`,
    ].join("\n");
    const paths = extractImportPaths(code);
    expect(paths).toContain("./auth");
    expect(paths).toContain("../utils/logger");
    expect(paths).toContain("./config");
  });

  it("ignores non-relative imports (packages)", () => {
    const code = [
      `import React from 'react';`,
      `import { useState } from 'react';`,
      `const express = require('express');`,
    ].join("\n");
    const paths = extractImportPaths(code);
    expect(paths).toEqual([]);
  });

  it("handles multiline imports", () => {
    const code = `import {\n  foo,\n  bar,\n  baz\n} from './multi';`;
    const paths = extractImportPaths(code);
    expect(paths).toContain("./multi");
  });

  it("handles re-exports", () => {
    const code = `export { default } from './re-exported';`;
    // The pattern looks for 'import ... from' but not 'export ... from'
    // This is expected — re-exports are not captured by current patterns
    const paths = extractImportPaths(code);
    expect(paths).not.toContain("./re-exported");
  });

  it("deduplicates paths imported multiple times", () => {
    const code = [
      `import { foo } from './shared';`,
      `import { bar } from './shared';`,
    ].join("\n");
    const paths = extractImportPaths(code);
    const sharedCount = paths.filter((p) => p === "./shared").length;
    expect(sharedCount).toBe(1);
  });

  it("returns empty array for code with no imports", () => {
    const code = `const x = 42;\nfunction hello() { return 'world'; }`;
    const paths = extractImportPaths(code);
    expect(paths).toEqual([]);
  });

  it("handles parent-relative paths", () => {
    const code = `import { db } from '../../data/database';`;
    const paths = extractImportPaths(code);
    expect(paths).toContain("../../data/database");
  });
});
