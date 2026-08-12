import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// 0811B scroll-reachability repair regression guard. This is a STATIC check
// on the CSS rule, not a live-browser scroll test — jsdom does not perform
// real layout/scrolling, so no component test here can prove recordings
// 0011-0025 are reachable. That was verified live against the running app
// (see 2026-08-11_MUSIC_0811B_MachineLifeResearchScrollRepair completion
// report). This test only guards against the specific fix — .ml-workspace
// becoming a bounded, scrollable region within .workspace-main's
// overflow:hidden flex chain — being silently reverted.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLES_PATH = path.resolve(__dirname, "../../styles.css");
const STYLES_TEXT = readFileSync(STYLES_PATH, "utf-8");

function extractRule(selector: string, css: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Rule not found: ${selector}`);
  return match[1];
}

describe("Machine Life workspace scroll owner (0811B regression guard)", () => {
  it(".ml-workspace declares itself as the bounded, vertically scrollable owner", () => {
    const rule = extractRule(".ml-workspace", STYLES_TEXT);
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).toMatch(/height:\s*100%/);
    // Bottom clearance for the fixed player/sampler transport, matching the
    // established .workspace-main--builder precedent (80px).
    expect(rule).toMatch(/padding:\s*24px 28px 80px/);
  });

  it("its bounding ancestor (.workspace-main) remains the clipping boundary — the fix must not remove that containment", () => {
    const rule = extractRule(".workspace-main", STYLES_TEXT);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/flex:\s*1/);
  });
});
