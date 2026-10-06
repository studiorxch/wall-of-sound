/**
 * MOP/SPRAY POINTER-UP WYSIWYG V1 -- COMMITTED-CACHE PENDING-BAKE SURVIVAL V1.
 *
 * Root cause this module fixes: `rebuildCommittedCacheIfNeeded`
 * (blackbookRuntime.ts) drops its ENTIRE `pendingSprayBakes` queue and
 * replays EVERY operation through the expensive synchronous canonical
 * `drawOperation` path whenever the committed Mark set changes wholesale
 * (Undo, CLEAR, NEW, Artwork/Pages switching, resize, sign-out). That was
 * correct for an operation the mutation actually REMOVED (a stale bake
 * must never merge into a Mark set that no longer contains its own
 * operation) but wrong for every OTHER, unrelated, still-present Spray
 * operation whose own background bake just happened to still be chunking
 * -- forcing it through the full, blocking, per-particle gradient paint
 * is exactly the stall 1003D exists to prevent, reachable again through
 * a different door (an unrelated Undo/CLEAR/NEW/Pages-switch while that
 * bake is in flight).
 *
 * The fix is this one pure, deterministic partition: a pending bake
 * SURVIVES a committed-cache rebuild if and only if its own
 * `operationId` is still present in the NEW `operations` array being
 * replayed. A surviving bake's own operation is skipped during the
 * synchronous replay (its existing `pendingCanvas` snapshot already
 * covers it visually, exactly as it already does during ordinary
 * authoring -- see `PendingSprayBake`'s own doc) and its existing
 * chunked `runSprayBakeFrame` progress continues completely undisturbed,
 * merging into `committedLayers.spray` whenever it finishes, same as
 * always. An orphaned bake (operation removed) is dropped outright --
 * never merged, never resumed.
 *
 * Deliberately NOT extended to every already-fully-baked, quiescent
 * Spray operation (one with no pending-bake entry at all): those pay the
 * SAME "a wholesale rebuild replays every operation" cost every other
 * material (Mop, Pencil, Pen, Marker) has always paid since DRAWING
 * LATENCY V1 (e005906) -- a pre-existing, separately-scoped, accepted
 * trade-off of the whole-cache-rebuild design, not part of the 1003D/E
 * pending-bake lifecycle this module completes. Making the ENTIRE
 * committed cache incrementally diffable against an arbitrary Mark-set
 * mutation would be a materially larger redesign than "operation
 * survival for pending bakes" and was not what recon found broken.
 *
 * Extracted into its own small, DOM-free module (rather than exported
 * straight out of blackbookRuntime.ts) because blackbookRuntime.ts
 * executes `document.querySelector` lookups at module load time and has
 * no test harness of its own -- this is the smallest seam that makes the
 * actual lifecycle DECISION deterministically unit-testable without
 * building one.
 */

/** The minimal shape this module needs from a committed `BlackbookOperation` -- never imports the full union type, so this module stays independent of blackbookArtworkBridge.ts. */
export interface OperationIdentity {
  readonly id: string;
}

/** The minimal shape this module needs from a `PendingSprayBake` entry. */
export interface PendingBakeIdentity {
  readonly operationId: string;
}

export interface PendingBakeSurvivalResult<TBake extends PendingBakeIdentity> {
  /** Bakes whose own operation is still present in `operations` -- keep queued, let them keep chunking/merging exactly as before. */
  readonly surviving: readonly TBake[];
  /** Bakes whose own operation is no longer present -- drop outright, never merge. */
  readonly orphaned: readonly TBake[];
}

/**
 * Pure, deterministic, side-effect-free. Never mutates `operations` or
 * `pendingBakes`. `operations` is read once into a `Set` of ids (O(n)),
 * then each pending bake is classified by a single lookup (O(1) each) --
 * O(operations + pendingBakes) overall, negligible next to the
 * synchronous replay this decision gates.
 */
export function partitionPendingBakesBySurvival<TBake extends PendingBakeIdentity>(
  operations: readonly OperationIdentity[],
  pendingBakes: readonly TBake[],
): PendingBakeSurvivalResult<TBake> {
  const presentOperationIds = new Set(operations.map((operation) => operation.id));
  const surviving: TBake[] = [];
  const orphaned: TBake[] = [];
  for (const bake of pendingBakes) {
    (presentOperationIds.has(bake.operationId) ? surviving : orphaned).push(bake);
  }
  return { surviving, orphaned };
}
