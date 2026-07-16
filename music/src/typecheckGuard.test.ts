/// <reference types="node" />
// 0715D_MUSIC_0715C_Live_Verification_And_Typecheck_Process_Repair §7 —
// a lightweight guard against silently reverting to a no-op typecheck.
// This repo's root tsconfig.json is solution-style (`files: []` +
// `references`), so a bare `tsc --noEmit` checks nothing while still
// exiting 0 (the exact defect this build repairs — see `npm run
// typecheck`, which now runs `tsc --build tsconfig.json` instead). This
// test uses the TypeScript compiler's OWN project-resolution API — never a
// hand-rolled JSON/glob parser — to assert every referenced project still
// resolves a real, non-trivial set of source files, so a future
// regression back to an empty/no-op project can't pass silently.

import { describe, it, expect } from "vitest";
import ts from "typescript";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT_TSCONFIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../tsconfig.json");

function readConfig(configPath: string): Record<string, unknown> {
  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  if (raw.error) throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText, "\n"));
  return raw.config;
}

function referencedConfigPaths(configPath: string): string[] {
  const config = readConfig(configPath);
  const refs = config.references as Array<{ path: string }> | undefined;
  if (!refs || refs.length === 0) return [];
  return refs.map((r) => {
    const resolved = path.resolve(path.dirname(configPath), r.path);
    return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
      ? path.join(resolved, "tsconfig.json")
      : resolved;
  });
}

function resolvedFileCount(configPath: string): number {
  const config = readConfig(configPath);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
  return parsed.fileNames.length;
}

describe("typecheck guard (0715D)", () => {
  it("the root tsconfig.json references at least one project", () => {
    expect(referencedConfigPaths(ROOT_TSCONFIG).length).toBeGreaterThan(0);
  });

  it("every referenced project config file exists on disk", () => {
    for (const configPath of referencedConfigPaths(ROOT_TSCONFIG)) {
      expect(fs.existsSync(configPath), `${configPath} should exist`).toBe(true);
    }
  });

  it("every referenced project resolves a real, non-trivial set of source files", () => {
    const refs = referencedConfigPaths(ROOT_TSCONFIG);
    const total = refs.reduce((sum, configPath) => sum + resolvedFileCount(configPath), 0);
    // The app alone has 300+ source files; this threshold sits far below
    // that so it only catches a genuine "resolves to nothing" regression
    // (e.g. `files: []` with no `include`), not ordinary file-count churn.
    expect(total).toBeGreaterThan(50);
  });
});
