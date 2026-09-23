/**
 * Member V1C -- "sign in to save": promotes the anonymous strokes already
 * visible on screen into the signed-in Member's own Artwork, by replaying
 * each one through the EXACT SAME persistence path a normal signed-in
 * stroke already uses (`persistStroke` -> `toGeographicMark` -> validation
 * -> `selectArtworkForMark` grouping -> `createArtwork`/
 * `appendOwnedArtworkMark` -> `bindArtwork` -> `onArtworkSaved` ->
 * `sessionArtworkLibrary`). This module adds NO new Firestore code, NO new
 * grouping logic, and NO new Artwork/Mark identity scheme -- it is pure
 * orchestration over what `mapArtworkBridge.ts`'s bridge already does.
 *
 * Reconnaissance (see the V1C recon report) found that anonymous drawing is
 * NOT durable today -- it lives only as untagged operations in
 * `surfaceDrawingRuntime.js`'s in-memory `overlayObjects` for the lifetime
 * of the tab. "Claim" therefore cannot mean "take over an existing
 * anonymous document" (none exists); it means promoting the in-session
 * composition into a newly-created, normally-authenticated Firestore
 * Artwork the instant real authentication succeeds.
 *
 * Coordination is deliberately private and in-memory only (a `WeakSet`,
 * never a field written onto the stroke object itself): once `persistStroke`
 * succeeds, the drawing runtime's own `bindArtwork` call tags the stroke
 * with `artworkId` -- which is what structurally removes it from
 * `getUnclaimedStrokes()` on the next read. The `WeakSet` here exists only
 * to protect the (narrow) window between "persistence started" and
 * "persistence resolved," so a concurrent/duplicate claim invocation cannot
 * dispatch the SAME still-in-flight operation twice.
 */

export interface ClaimableDrawingRuntime<TStroke> {
  /** A snapshot (never the live internal array) of this surface's operations that are real user Marks and not yet bound to a Firestore Artwork. */
  getUnclaimedStrokes(): readonly TStroke[];
}

export interface ClaimPersistence<TStroke> {
  /** The SAME persistence bridge instance normal signed-in drawing already uses (e.g. `createMapArtworkPersistenceBridge`'s return value). */
  persistStroke(stroke: TStroke): Promise<void>;
}

export interface AnonymousArtworkClaimResult {
  readonly attemptedCount: number;
  readonly succeededCount: number;
  readonly failedCount: number;
  /** True only if, after this attempt, no eligible unbound operation remains -- the only truthful basis for a global "Saved" status. */
  readonly complete: boolean;
}

export interface AnonymousArtworkClaimer<TStroke> {
  claimAnonymousStrokes(
    drawing: ClaimableDrawingRuntime<TStroke>,
    persistence: ClaimPersistence<TStroke>,
  ): Promise<AnonymousArtworkClaimResult>;
}

export function createAnonymousArtworkClaimer<TStroke extends object>(): AnonymousArtworkClaimer<TStroke> {
  const inFlight = new WeakSet<TStroke>();

  async function claimAnonymousStrokes(
    drawing: ClaimableDrawingRuntime<TStroke>,
    persistence: ClaimPersistence<TStroke>,
  ): Promise<AnonymousArtworkClaimResult> {
    const candidates = drawing.getUnclaimedStrokes().filter((stroke) => !inFlight.has(stroke));
    candidates.forEach((stroke) => inFlight.add(stroke));

    const outcomes = await Promise.allSettled(
      candidates.map((stroke) => persistence.persistStroke(stroke).finally(() => inFlight.delete(stroke))),
    );

    const succeededCount = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    const remaining = drawing.getUnclaimedStrokes().length;

    return {
      attemptedCount: candidates.length,
      succeededCount,
      failedCount: candidates.length - succeededCount,
      complete: remaining === 0,
    };
  }

  return { claimAnonymousStrokes };
}
