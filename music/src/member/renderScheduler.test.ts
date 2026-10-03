import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRenderScheduler } from "./renderScheduler";

/**
 * DRAWING LATENCY V2 -- these tests prove the actual coalescing fix (not
 * merely "it feels faster"): many `schedule()` calls before a frame fires
 * must produce exactly one `render()` call, `renderNow()` must cancel any
 * pending frame and never leave a stale callback that fires later, and
 * the scheduler must recover cleanly across repeated gesture cycles.
 */
describe("createRenderScheduler", () => {
  let frames: FrameRequestCallback[];
  let nextHandle: number;
  let cancelled: Set<number>;

  beforeEach(() => {
    frames = [];
    nextHandle = 1;
    cancelled = new Set();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return nextHandle++;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      cancelled.add(handle);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fireNextFrame(): void {
    const callback = frames.shift();
    if (!callback) throw new Error("no pending animation frame to fire");
    callback(0);
  }

  it("many schedule() calls before the frame fires produce exactly one requestAnimationFrame registration and one render", () => {
    const render = vi.fn();
    const scheduler = createRenderScheduler(render);

    // Simulates many coalesced pointermove dispatches arriving within the
    // same frame interval -- the exact real-world trigger this fix exists for.
    for (let i = 0; i < 50; i += 1) scheduler.schedule();

    expect(frames.length).toBe(1); // only ONE rAF was ever registered
    expect(render).not.toHaveBeenCalled(); // nothing paints until the frame actually fires

    fireNextFrame();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("isPending() reflects whether a frame is currently scheduled", () => {
    const scheduler = createRenderScheduler(vi.fn());
    expect(scheduler.isPending()).toBe(false);
    scheduler.schedule();
    expect(scheduler.isPending()).toBe(true);
    fireNextFrame();
    expect(scheduler.isPending()).toBe(false);
  });

  it("a NEW schedule() call after a frame fires registers a fresh frame -- the scheduler keeps working across repeated gesture cycles (many strokes in one session)", () => {
    const render = vi.fn();
    const scheduler = createRenderScheduler(render);

    scheduler.schedule();
    fireNextFrame();
    scheduler.schedule();
    fireNextFrame();
    scheduler.schedule();
    fireNextFrame();

    expect(render).toHaveBeenCalledTimes(3);
    expect(frames.length).toBe(0);
  });

  it("renderNow() runs the render callback synchronously and immediately, without waiting for a frame", () => {
    const render = vi.fn();
    const scheduler = createRenderScheduler(render);
    scheduler.renderNow();
    expect(render).toHaveBeenCalledTimes(1);
    expect(frames.length).toBe(0); // never touched requestAnimationFrame at all
  });

  it("renderNow() cancels a pending scheduled frame -- the exact 'no stale callback repaints obsolete gesture state' requirement (pointer-up after pointermove scheduled a frame, Undo/CLEAR/Pages-switch arriving before a pending frame fires)", () => {
    const render = vi.fn();
    const scheduler = createRenderScheduler(render);

    scheduler.schedule(); // e.g. a pointermove mid-gesture
    const scheduledHandle = nextHandle - 1;
    expect(scheduler.isPending()).toBe(true);

    scheduler.renderNow(); // e.g. the same gesture's pointerup
    expect(cancelled.has(scheduledHandle)).toBe(true); // cancelAnimationFrame was actually called for it
    expect(scheduler.isPending()).toBe(false);
    expect(render).toHaveBeenCalledTimes(1); // from renderNow() itself

    // A real browser never invokes a callback once cancelAnimationFrame
    // has been called for its handle -- this mock keeps the callback
    // reference around (to let the assertion above confirm cancellation
    // actually happened), but the scheduler's own pending state is
    // already cleared, so a SUBSEQUENT schedule() starts fresh rather
    // than being blocked by (or double-firing alongside) the old one.
    scheduler.schedule();
    expect(frames.length).toBe(2); // the stale (cancelled) one + the fresh one
    fireNextFrame(); // fires the STALE callback -- harmless: render() just re-reads current state
    expect(render).toHaveBeenCalledTimes(2);
    fireNextFrame(); // fires the fresh one scheduled above
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("schedule() immediately after renderNow() starts a fresh, independent pending frame (renderNow() does not poison future scheduling)", () => {
    const render = vi.fn();
    const scheduler = createRenderScheduler(render);
    scheduler.renderNow();
    scheduler.schedule();
    expect(scheduler.isPending()).toBe(true);
    fireNextFrame();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("calling renderNow() with nothing pending is safe and never calls cancelAnimationFrame", () => {
    const render = vi.fn();
    const scheduler = createRenderScheduler(render);
    scheduler.renderNow();
    expect(cancelled.size).toBe(0);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
