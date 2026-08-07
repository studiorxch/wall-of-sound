import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// This codebase's vitest runs in plain Node (no jsdom/happy-dom configured —
// confirmed via package.json/vite.config.ts before writing this test), so
// there is no real DOM/`window` global. `openOrFocusRacetrack()` references
// `window.open` directly (matching wallItineraryRunBridge.ts's own
// openOrFocusLiveMap() convention) — this test stubs a minimal fake
// `window` object rather than relying on a real browser environment.

describe("openOrFocusRacetrack", () => {
  let openMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    openMock = vi.fn(() => ({ closed: false }) as unknown as Window);
    (globalThis as unknown as { window: { open: typeof openMock } }).window = { open: openMock };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("opens the RACETRACK url on the same named window LIVE MAP uses", async () => {
    const { openOrFocusRacetrack, __test } = await import("./wallRacetrackBridge");
    const { LIVE_MAP_WINDOW_NAME } = await import("./wallItineraryRunBridge");
    const result = openOrFocusRacetrack();
    expect(result).toEqual({ ok: true });
    expect(openMock).toHaveBeenCalledWith(__test.RACETRACK_URL, LIVE_MAP_WINDOW_NAME);
  });

  it("uses /wall-app/?mode=racetrack, never /wall/index.html", async () => {
    const { __test } = await import("./wallRacetrackBridge");
    expect(__test.RACETRACK_URL).toBe("/wall-app/?mode=racetrack");
  });

  it("repeated activation calls window.open again (not merely .focus()) so an already-open tab on a different mode still navigates", async () => {
    const { openOrFocusRacetrack } = await import("./wallRacetrackBridge");
    openOrFocusRacetrack();
    openOrFocusRacetrack();
    expect(openMock).toHaveBeenCalledTimes(2);
  });

  it("reports popup_blocked when window.open returns null", async () => {
    openMock.mockReturnValue(null);
    const { openOrFocusRacetrack } = await import("./wallRacetrackBridge");
    const result = openOrFocusRacetrack();
    expect(result).toEqual({ ok: false, reason: "popup_blocked" });
  });
});
