import type { HomeSurfaceIdentity } from "../data/homeRouteTypes";

/** Same-origin trusted first-party contract. Document identity rejects callbacks retained from departed children. */
export interface HomeSurfaceHost {
  readonly version: 1;
  ready(source: Document, identity: HomeSurfaceIdentity): boolean;
  requestNavigate(source: Document, identity: HomeSurfaceIdentity, destination: unknown): boolean;
  /** Remounts the BLACKBOOK surface at a different artwork (HOST-01 fixture contract; a document reload). */
  replaceArtwork(source: Document, identity: HomeSurfaceIdentity, artworkId: unknown): boolean;
  /**
   * HOST-03 -- the real BLACKBOOK's OWN already-resolved artwork identity
   * (its existing no-reload `openArtwork()`/PAGES switch, `setActiveArtworkIdentity`'s
   * one funnel) reported for HOME's top-level URL/history sync only. Never
   * remounts/reloads the surface -- that would regress BLACKBOOK's existing
   * same-session PAGES switch into a full document reload on every card
   * click. `replaceArtwork` above remains the HOST-01 fixture's own
   * host-driven "switch to a different document" contract; this is the
   * surface's own report of state it already changed itself.
   */
  syncArtworkRoute(source: Document, identity: HomeSurfaceIdentity, artworkId: unknown): boolean;
}

declare global {
  interface Window { StudioRichHome?: HomeSurfaceHost }
}
