# Spatial Spraypaint V0.10.9 Current Status

Date: 2026-09-17

Status: COMPLETE — Mop Drips: Pooling Liquid, Not Hair. Replaced the per-trigger independent-drip-seed model with a real spatial wet-paint field: deposition accumulates into a small number of pool nodes along the mark's lower boundary, neighboring deposits merge, and only a sufficiently loaded node starts a gravity channel. Multiple channels from the same node coalesce at a shared root instead of scattering. 615/615 tests pass (rewritten test suite for the new model), TypeScript clean, production build clean.

Baseline: V0.10.8 commit `9cdb5b8`/`f761ce8` (the "hair" version this corrects).

## 1. What happened to the older pooling implementation

**There was no older, better pooling implementation to restore.** I searched the full git history (227 commits) for every term requested — pool, reservoir, wet load, wet underlay, accumulator, gravity, merging/coalescence, persistent/growing drip underlay — across every commit touching `WetPaintModel.ts`, `WetDripEngine.ts`, `PaintMarkerEngine.ts`, and `DripLogic.ts`, from the project's very first drip-related commits onward. Findings:

- `paintLoad` has **always** been a single scalar per stroke (one number), never a spatial field with multiple independently-tracked regions. This traces back to the earliest `WetPaintAccumulator` implementation and was never replaced by anything richer — V0.10.7/V0.10.8 (my own prior passes) inherited and extended this same single-scalar design, they didn't regress away from a better one.
- The only thing resembling "pooling" in the mark's history is `originPoolRadius` (a single circle's radius, one per drip) and `attachmentUnderlap`/`prependHiddenDripUnderlap` (added in commit `c05dc9e`, "underpaint spatial spraypaint mop drips") — a purely cosmetic trick that extends a drip's rendered strip slightly *above* its origin so the seam where it meets the mark body is hidden. It is not a reservoir, has no concept of merging, and was always per-drip, never shared across drips.
- `resolveMopDripAttachment`/`resolveMopFootprintLowerBoundaryY` (also long-standing, untouched by this pass) compute *where along the mark's rendered boundary* a given x-offset lands — real, reusable boundary-following geometry — but they've only ever been called once per already-decided drip, with an arbitrary offset. Nothing before this pass used that boundary geometry to *decide how many origins should exist* or to merge nearby ones.
- One tangential find: commit `8f75a6c` ("Pink Dot stationary reset — true aerosol deposition field, organic not vector") built a genuine continuous-density-field pattern, but for Pink Dot Fat's stationary spray dot, not Mop, and not reusable as-is (different math, different tool). Conceptually similar in spirit to what this pass needed, not a component I could import.

**Conclusion**: nothing was bypassed or replaced — the richer pooling model this pass calls for did not exist anywhere in this project's history. This is confirmed net-new architecture, not a restoration.

## 2. Whether it can be restored/reused

Not applicable per the above — there was nothing to restore. `resolveMopDripAttachment` and `resolveMopFootprintLowerBoundaryY` (the boundary-following geometry) **were reused as-is**, called more times and in a different pattern (once per pool-node touch instead of once per drip), but not modified.

## 3. The new wet-field model

Implemented entirely in `WetPaintAccumulator` (`src/WetPaintModel.ts`), scoped to Mop and Drip Mop only (Drippy Chisel — not reachable via the shipped UI — keeps the older per-trigger cluster model unchanged, since it doesn't use the mark-boundary geometry this pool model depends on).

**`PoolNode`**: `{ x, y, radius, load, channelsSpawned, lastChannelAt }` — a discrete node in the spatial field, not a per-drip record.

**`depositIntoPool(footprint, point, size, paintLoad, elapsedSeconds, stationary)`**, called from every `observe()`:
1. Computes a `depositAmount` for this instant (scales with travel speed being slow / stationary dwell, current body `paintLoad`, Flow modifier, and a `squeezeMultiplier` — see §Squeeze below).
2. Finds the nearest existing pool node within `poolMergeRatio * size` of the current point. If one exists, **merges** into it: load sums (capped at `poolMaxLoad`), the node's x drifts toward wherever more paint is landing (load-weighted average), and its recorded boundary `y`/`radius` are refreshed from `resolveMopDripAttachment` called against the **current** footprint. If none is close enough, a new node is created.
3. Idle nodes (not touched this call) slowly decay (`poolDecayPerSecond`) rather than staying loaded forever once the marker moves on.
4. **Only the node just touched by this deposit** is checked for channel eligibility (`load >= poolThreshold`, under its own `poolMaxChannelsPerNode` ceiling, past its own `poolChannelCooldownMs` since its last channel). This is a deliberate, important restriction — see the attachment note below.

**`spawnPoolChannel(node, size, paintLoad)`**: one gravity run breaking free from a loaded node. Width and length both scale with `node.load / sqrt(channelsSpawned + 1)` — the node's own flux, divided down as more channels already draw from it, so a node's *second* or *third* channel comes out narrower/shorter than its first without a separate rule for it. The channel's horizontal offset stays within `node.radius * 0.6` of the node's own position — channels from the same pool coalesce near a shared root instead of scattering across the stroke. Geometry itself (kink chance/amplitude, bend ratio) was also dialed back from V0.10.8's tuning (e.g. Mop's `kinkChance` `0.82 → 0.4`, `bendRatio` `0.16 → 0.075`) per "gravity should dominate... not intentionally curly."

**Attachment fix (why only the just-touched node may spawn)**: an early version let *any* sufficiently loaded node spawn on *any* call, including nodes the marker had since moved away from. That reused each node's boundary position as recorded whenever it was last deposited into — fine while fresh, but if a channel spawned many calls later from an old node, the mark's rendered body may have moved on and no longer reach that position, producing a visually detached drip. Caught by the existing `MopRuntimeParity.test.ts` regression suite (which renders the real incremental pipeline and checks every spawned drip's origin lands inside that frame's actual rendered shapes) — 8 failures on the first attempt. Fixed by restricting spawning to the node touched by *this* call only: its recorded `(x, y, radius)` always come from the footprint passed in on this exact call, so a spawned channel is always anchored to the body as rendered that frame. Idle nodes keep their load/history and can still spawn later — once the marker comes back within merge distance and touches them again.

**`settle(dripsEnabled)`**: on stroke end, any pool node still carrying enough load (`>= poolThreshold * 0.5`) spawns one final channel — the reservoir keeps dripping for a moment after the pointer lifts.

## Squeeze preparation

`WetPaintAccumulator.setSqueezeMultiplier(value)` is wired into `depositIntoPool`'s `depositAmount` calculation (`... * this.squeezeMultiplier * ...`, default `1`, unused by any input yet). A future Squeeze control only needs to call this setter with a value `> 1` while held — everything downstream (merging, thresholds, channel count/width/length) already scales off however much load lands in the field, so a bigger multiplier alone produces a larger reservoir and more/larger gravity channels with no other wiring. The keyboard control itself was intentionally **not** implemented, per the brief.

## 4. Before / after vs. the masked reference

Both from the identical heavy-Mop scripted stroke used in prior reports (same path), this time with a few deliberate brief pauses along the path (not only at the very end) to more fairly exercise multiple pooled regions the way a real heavy tag would:

- **Before (V0.10.8, "hair")**: ~28–32 independent, evenly-distributed strands across the whole stroke, each its own seed — no visible pooling at the origins, reads as attached hair/roots.
- **After (this pass)**: **4 distinct pooled regions** (top loop, crossbar, lower-left arm, tail), each producing 2–4 coalesced channels from a shared, visibly widened root — varied lengths (several short stubs, a few very long runs reaching far below), gravity-dominant mostly-vertical paths, no drips scattered along the parts of the stroke the pointer only passed through quickly. A zoomed detail screenshot of one cluster shows the flared pooled root and a single long tapering run descending from it, structurally matching the reference's red-dot/yellow-dot relationship (few true origins, visible coalescence, gravity channels below).

Screenshots sent alongside this report.

## 5. Tests

`npx vitest run`: 615/615 passing. `WetPaintModel.test.ts` was substantially rewritten for the new model's actual invariants (the old tests encoded the "one trigger can spawn several simultaneous independent drips" premise this pass explicitly reverses):
- **New**: pooling produces far fewer distinct origins than visible channels (3 heavy spots → ≤3 origin clusters, but meaningfully more total channels than that).
- **New**: channels from the same pool node stay clustered near its own origin (bounded spread), not scattered across the stroke.
- **Rewritten**: the "wandering gravity path" test now asserts gravity dominance (bend stays a modest fraction of run length) and that kinks are the occasional exception, not the near-universal rule from V0.10.8.
- Existing hierarchy/geometry invariants (Drip Mop stronger than Mop, Drippy Chisel restrained, deterministic replay, `dripsEnabled=false` suppression, Flow/Viscosity authority, `settle()` persistence, and every `resolveMopDripAttachment` placement/attachment-direction test) kept and still hold.
- `MopRuntimeParity.test.ts` (unmodified, pre-existing) is what caught and validated the attachment fix described above — every spawned channel across six real incremental-stroke shapes (stationary, diagonals, horizontal/vertical, curved) lands inside that exact frame's rendered mark.
`npx tsc --noEmit`: clean. `npx vite build`: clean.

## 6. Commit

`519ba86` — "fix: Spatial Spraypaint V0.10.9 -- replace independent Mop drip seeds with pooling wet-field model"

## Do not touch — respected

No changes to Spray, Flair, UI, Pencil, or Round/Chisel (unaffected — they don't use this file's pool model at all). `DripLogic.ts` (shared rendering geometry) was not touched this pass; the `kink2` support it already gained in V0.10.8 was reused, not modified.
