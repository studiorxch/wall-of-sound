import type { HomeSurfaceIdentity } from "../data/homeRouteTypes";

/** Same-origin trusted first-party contract. Document identity rejects callbacks retained from departed children. */
export interface HomeSurfaceHost {
  readonly version: 1;
  ready(source: Document, identity: HomeSurfaceIdentity): boolean;
  requestNavigate(source: Document, identity: HomeSurfaceIdentity, destination: unknown): boolean;
  replaceArtwork(source: Document, identity: HomeSurfaceIdentity, artworkId: unknown): boolean;
}

declare global {
  interface Window { StudioRichHome?: HomeSurfaceHost }
}
