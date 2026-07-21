// Correction: the RadioLoop audition hook must never call
// handleBeforeLoopPreview or any other MUSIC-transport chokepoint, and
// must never reach into src/audio/ (the main loop-audition engine) or
// App.tsx's playback state. This is checked directly against the file's
// own source rather than by mocking a full Web Audio environment (which
// this project's vitest config doesn't provide) — a literal, cheap
// regression guard for exactly what the correction demanded.

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// The header doc comment deliberately NAMES these forbidden symbols to
// explain why they must never appear — strip `//` comment lines before
// scanning so the guard checks actual code, not its own explanation.
const SOURCE = fs.readFileSync(path.join(__dirname, "radioLoopAudition.ts"), "utf-8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /handleBeforeLoopPreview/, reason: "calls the MUSIC-transport mutual-exclusion chokepoint, which actively pauses the standard <audio> element and dual-deck engine" },
  { pattern: /from ["']\.\.\/\.\.\/audio\//, reason: "imports from src/audio/ (the main loop-audition engine's own module tree)" },
  { pattern: /useLoopAuditionController/, reason: "reaches into the existing loop-audition controller" },
  { pattern: /preparedPlayback/, reason: "reaches into App.tsx's dual-deck/prepared-playback state" },
];

describe("useRadioLoopAudition isolation (source-text guard)", () => {
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    it(`never references a forbidden symbol: ${reason}`, () => {
      expect(pattern.test(SOURCE)).toBe(false);
    });
  }

  it("owns its own AudioContext rather than sharing one", () => {
    expect(SOURCE).toContain("new AC()");
  });
});
