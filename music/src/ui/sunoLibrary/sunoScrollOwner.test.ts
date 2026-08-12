import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Static CSS regression test — NOT a substitute for real browser scrolling
// verification. This confirms the *rules as authored* establish exactly one
// page-level scroll owner and one deliberately-bounded inner scroller,
// preventing a future edit from accidentally introducing two competing
// full-height auto-scroll containers (a real nested-scroll-trap bug class).
// Real scrolling — that the final canonical recording is actually
// reachable, that the transport stays clear, that there's no trap a mouse
// wheel can get stuck in — is verified live in a real browser (0812
// completion report, live verification §10 item 19), which this test
// cannot and does not claim to do.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STYLES_PATH = path.resolve(__dirname, "../../styles.css");
const css = readFileSync(STYLES_PATH, "utf-8");

function ruleBodyFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`No CSS rule found for selector: ${selector}`);
  return match[1];
}

describe("Suno workspace scroll-owner CSS (static verification)", () => {
  it(".suno-workspace fills its fixed-shell container and does not itself scroll", () => {
    const body = ruleBodyFor(".suno-workspace");
    expect(body).toMatch(/height:\s*100%/);
    // Must not also claim overflow-y: auto — that would make TWO ancestors
    // in the same chain independently scrollable, which is the nested-trap
    // failure mode this test exists to catch.
    expect(body).not.toMatch(/overflow-y:\s*auto/);
  });

  it(".suno-workspace-scroll-region is the single page-level scroll owner", () => {
    const body = ruleBodyFor(".suno-workspace-scroll-region");
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/min-height:\s*0/); // required for flex-child scrolling to work at all
  });

  it(".suno-recording-table-scroll is a deliberately bounded inner scroller, not full-height", () => {
    // The row-virtualization table needs its own scroll container (it
    // tracks scrollTop directly to compute the visible row window), but it
    // must never claim the full remaining viewport height — that would
    // make it functionally indistinguishable from a second page-level
    // scroller and reintroduce the trap this component's layout avoids.
    // Its height is set inline via React (CONTAINER_HEIGHT), not in CSS —
    // confirm the CSS rule itself does not declare a competing height or
    // its own overflow-y, which would fight the inline style.
    const body = ruleBodyFor(".suno-recording-table-scroll");
    expect(body).not.toMatch(/height:\s*100%/);
    expect(body).not.toMatch(/overflow-y:\s*auto/);
  });

  it("the recording table's virtualization height is bounded, not viewport-filling (source check)", () => {
    const browserSource = readFileSync(
      path.resolve(__dirname, "SunoWorkspaceBrowser.tsx"),
      "utf-8",
    );
    expect(browserSource).toMatch(/CONTAINER_HEIGHT\s*=\s*\d+/);
    expect(browserSource).not.toMatch(/CONTAINER_HEIGHT\s*=\s*['"]100%['"]/);
  });
});
