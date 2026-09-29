import type { HomeSurfaceIdentity } from "../data/homeRouteTypes";
import type { HostedGoogleCredentialResult } from "../data/hostedAuthTypes";
import type { RadioChannelReceiver } from "../logic/radio/createRadioChannelReceiver";

/**
 * RADIO-01 -- deliberately narrower than `HomeSurfaceIdentity`: only the
 * document-mount identity (runtime + navigation generation), never
 * `routeKey`. RADIO ownership has nothing to do with which Artwork is
 * currently active in BLACKBOOK -- gating on the full route identity would
 * make every `syncArtworkRoute` call (which never remounts) invalidate an
 * already-granted RADIO session handle for no reason. A real remount
 * (`navigationId` incrementing) is the only thing that should end one
 * mount's claim on the session.
 */
export interface HomeMountIdentity {
  readonly runtimeId: string;
  readonly navigationId: number;
}

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
  /**
   * HOST-03B -- initiates and completes a Google sign-in popup from HOME's
   * own never-nested window on a hosted surface's behalf, resolving to an
   * opaque, serialized credential for the requesting surface's OWN existing
   * `MemberIdentityAuthority.signInWithCredential` to complete with. HOME
   * never constructs a second member-state authority and never inspects the
   * credential. The caller MUST invoke this synchronously within its own
   * click handler (same-origin direct call, no timer/message indirection)
   * so the popup's user-gesture requirement is preserved. Never falls back
   * to anything -- every failure mode (popup blocked/closed, a Firebase
   * error, a missing credential, a stale/wrong identity, or HOME being
   * unavailable to begin with) resolves to an explicit `{ok:false,reason}`;
   * the caller must not retry via a locally-initiated `signInWithPopup`.
   */
  requestGoogleCredential(source: Document, identity: HomeSurfaceIdentity): Promise<HostedGoogleCredentialResult>;
  /**
   * RADIO-01 -- hands the CURRENTLY active mount a handle bound to HOME's
   * ONE persistent RADIO session (constructed lazily, reused verbatim
   * across every later surface swap for this HOME document's lifetime).
   * Returns `null` when `identity` does not match the currently active
   * mount (stale/wrong runtime, a departed document, or HOME simply not
   * having reached "active" yet) -- the caller MUST treat `null` as an
   * explicit failure and must NEVER fall back to constructing its own
   * local engine; see `createFailedRadioChannelReceiver`. Gated on mount
   * identity only (`HomeMountIdentity`, not the full route/Artwork
   * identity) -- an Artwork-only `syncArtworkRoute` change must never
   * invalidate an already-granted handle.
   */
  getRadioSession(source: Document, identity: HomeMountIdentity): RadioChannelReceiver | null;
}

declare global {
  interface Window { StudioRichHome?: HomeSurfaceHost }
}
