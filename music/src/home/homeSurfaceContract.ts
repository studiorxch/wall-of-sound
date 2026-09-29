import type { HomeSurfaceIdentity } from "../data/homeRouteTypes";
import type { HostedGoogleCredentialResult } from "../data/hostedAuthTypes";

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
}

declare global {
  interface Window { StudioRichHome?: HomeSurfaceHost }
}
