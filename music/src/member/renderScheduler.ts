/**
 * DRAWING LATENCY V2 -- recon (real iPad + Apple Pencil retest after the
 * V1 deposition-caching pass) found the remaining shared bottleneck: every
 * BLACKBOOK tool called `render()` SYNCHRONOUSLY, directly inside the
 * `pointermove` handler, once per DISPATCHED event, with no scheduling of
 * any kind. Apple Pencil's native sampling rate (even with
 * `getCoalescedEvents()` already capturing every batched raw sample into
 * `activePoints`) can dispatch `pointermove` faster than one full,
 * synchronous `render()` call can complete -- producing a growing event
 * backlog: each queued dispatch still runs its own full render before the
 * next can even be read, so the visible line falls further behind the
 * physical Pencil position the faster/longer a gesture runs, draining
 * only once input slows enough to drop back under the achievable render
 * throughput. This is a pure, dependency-free fix for exactly that: cap
 * actual paint work to at most once per real display frame, regardless of
 * how many pointer/wheel/resize events arrive before that frame -- never
 * by dropping or coalescing fewer POINTS (point capture into
 * `activePoints` is completely unaffected; this only changes when the
 * already-captured points get PAINTED).
 *
 * Deliberately a standalone module (no DOM/Blackbook/Artwork knowledge
 * beyond the global `requestAnimationFrame`/`cancelAnimationFrame`
 * themselves) so its coalescing behavior -- the actual fix -- is
 * unit-testable without a live browser or a real animation frame.
 */
export interface RenderScheduler {
  /**
   * Requests one render on the next animation frame. Calling this
   * multiple times before that frame fires is a no-op after the first --
   * many triggers within one frame interval (many coalesced pointermove
   * dispatches, a wheel-zoom burst, a resize storm) still produce at most
   * ONE actual render for that frame, picking up whatever state is
   * current at the moment the frame callback finally runs.
   */
  schedule(): void;
  /**
   * Cancels any pending scheduled render (if one is pending) and runs the
   * render callback synchronously, right now. Used by every discrete,
   * state-changing action (pointerup, Undo, CLEAR, Pages/artwork
   * switching, sign-out, resize, a tool/button click) that needs to
   * reconcile immediately rather than wait an unpredictable fraction of a
   * frame -- and, just as importantly, guarantees no STALE pending
   * callback from an earlier, now-obsolete gesture/state survives past
   * this point to repaint it later.
   */
  renderNow(): void;
  /** True while a render is scheduled but hasn't fired yet -- exposed for tests/diagnostics only. */
  isPending(): boolean;
}

export function createRenderScheduler(render: () => void): RenderScheduler {
  let pendingHandle: number | null = null;

  function schedule(): void {
    if (pendingHandle !== null) return;
    pendingHandle = requestAnimationFrame(() => {
      pendingHandle = null;
      render();
    });
  }

  function renderNow(): void {
    if (pendingHandle !== null) {
      cancelAnimationFrame(pendingHandle);
      pendingHandle = null;
    }
    render();
  }

  function isPending(): boolean {
    return pendingHandle !== null;
  }

  return { schedule, renderNow, isPending };
}
