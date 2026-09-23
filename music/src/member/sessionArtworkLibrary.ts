import type { Artwork } from "@studiorich/member-identity";

/**
 * Member V1B -- the ONE authoritative in-memory projection of the
 * signed-in Member's owned Artwork for the current session.
 *
 * Firestore remains the durable truth; this is never written to before a
 * persistence operation has actually succeeded (see `mapArtworkBridge.ts`'s
 * `onArtworkSaved`/`onArtworkRemoved`, which only fire from `retain()` after
 * a real Firestore round trip returns). Initial state comes from
 * `listOwnedArtwork` at sign-in (`replaceAll`); after that, `upsert`/`remove`
 * keep it in sync with each successful persistence result -- no redundant
 * Firestore reads.
 */

export interface SessionArtworkLibrary {
  getAll(): readonly Artwork[];
  /** Full replacement -- used for initial hydration and for reset on sign-out. */
  replaceAll(artworks: readonly Artwork[]): void;
  /** Insert a new Artwork or replace an existing one by id -- never duplicates a card. */
  upsert(artwork: Artwork): void;
  remove(artworkId: string): void;
  /** Notified after any of the above actually changes the projection (not on a no-op remove of an unknown id). */
  subscribe(listener: () => void): () => void;
}

export function createSessionArtworkLibrary(): SessionArtworkLibrary {
  let byId = new Map<string, Artwork>();
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    getAll(): readonly Artwork[] {
      return Array.from(byId.values());
    },
    replaceAll(artworks: readonly Artwork[]): void {
      byId = new Map(artworks.map((item) => [item.id, item]));
      notify();
    },
    upsert(artwork: Artwork): void {
      byId.set(artwork.id, artwork);
      notify();
    },
    remove(artworkId: string): void {
      if (byId.delete(artworkId)) notify();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
