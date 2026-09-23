/**
 * ARTWORK V1 -- explicit Current Artwork authority.
 *
 * The central invariant this build introduces: THE SESSION CHOOSES THE
 * ARTWORK. Geographic proximity (the old `selectArtworkForMark`) no longer
 * decides which Firestore document a new Mark belongs to for the Subway
 * Map bridge -- this small session module does, and `mapArtworkBridge.ts`'s
 * persistence routing reads it fresh on every persisted stroke.
 *
 * Three states, never more:
 * - "none": no Current Artwork. New strokes stay visually drawn but
 *   UNBOUND -- never silently persisted into a proximity-defined document.
 *   This is the ordinary shared Map's default state.
 * - "pending": a Member explicitly started a new Artwork (`+ NEW ARTWORK`,
 *   or the sign-in-to-save/no-current-artwork promotion path) but no
 *   Firestore document exists yet -- one is created lazily by the FIRST
 *   Mark that actually persists (see `mapArtworkBridge.ts`). This is the
 *   deliberate resolution to the "can we create an empty Artwork document"
 *   blocker: the current schema/rules require `marks.size() >= 1`
 *   (`firestore.rules`'s `hasValidArtworkV1Shape`), so there is no safe way
 *   to create a truly empty document without inventing placeholder
 *   geometry -- which this build explicitly refuses to do. "Pending"
 *   simply defers document creation to real content instead.
 * - { kind: "artwork", artworkId }: an explicit, already-persisted
 *   Artwork is Current -- every eligible new Mark appends to exactly this
 *   document, regardless of geographic distance.
 *
 * Deliberately NOT persisted across reload: reopening the same Artwork
 * after a reload is always an explicit action (Member Home -> a card),
 * never automatic -- see subwayMemberRuntime.ts's scoped-hydration doc.
 */

export type CurrentArtworkState =
  | { readonly kind: "none" }
  | { readonly kind: "pending" }
  | { readonly kind: "artwork"; readonly artworkId: string };

export const NO_CURRENT_ARTWORK: CurrentArtworkState = { kind: "none" };

export interface CurrentArtworkSession {
  getState(): CurrentArtworkState;
  /** Arms a new Artwork: no document exists yet, created lazily by the first persisted Mark. */
  setPendingNewArtwork(): void;
  /** Makes an already-known Artwork id Current -- e.g. opening it from Member Home, or a "pending" Artwork's first Mark establishing its real id. */
  setCurrentArtwork(artworkId: string): void;
  /** Returns to the ordinary shared-Map default: no Current Artwork. */
  clear(): void;
  subscribe(listener: (state: CurrentArtworkState) => void): () => void;
}

export function createCurrentArtworkSession(): CurrentArtworkSession {
  let state: CurrentArtworkState = NO_CURRENT_ARTWORK;
  const listeners = new Set<(state: CurrentArtworkState) => void>();

  function set(next: CurrentArtworkState): void {
    state = next;
    for (const listener of listeners) listener(state);
  }

  return {
    getState: () => state,
    setPendingNewArtwork: () => set({ kind: "pending" }),
    setCurrentArtwork: (artworkId: string) => set({ kind: "artwork", artworkId }),
    clear: () => set(NO_CURRENT_ARTWORK),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
