export type {
  CanonicalAuthUser,
  MemberAccountStatus,
  MemberIdentityError,
  MemberIdentityErrorScope,
  MemberIdentityState,
  StudioRichMember,
} from "./data/memberTypes.js";
export type {
  ArtworkRepository,
  Artwork,
  ArtworkBounds,
  ArtworkMark,
  ArtworkType,
  CreateArtworkInput,
  CreateMapArtworkInput,
  GeographicArtworkPoint,
  GeographicBounds,
  GeographicArtworkStroke,
  GeographicStrokeMark,
  LocalArtworkPoint,
  LocalBounds,
  LocalStrokeMark,
  MapArtwork,
  PageFrame,
  StrokeMark,
  MaterialErasureMark,
  LocalMaterialErasureMark,
  GeographicMaterialErasureMark,
} from "./data/artworkTypes.js";
export type { ArtMaterialId, ArtSupplyId, ArtSupplySettings, MarkMaterialIdentity, PencilSupplySettings } from "./data/artSupplyTypes.js";
export { MARKER_SUPPLY, MOP_SUPPLY, PEN_SUPPLY, PENCIL_SUPPLY, PENCIL_ERASER_SUPPLY, SPRAY_SUPPLY, canEraseMaterial } from "./data/artSupplyTypes.js";
export { ARTWORK_GROUPING_PROXIMITY_DEGREES, ARTWORK_GROUPING_PROXIMITY_LOCAL, boundsForMarks, normalizeArtworkTitle, selectArtworkForMark } from "./logic/artworkDocument.js";
export {
  serializePublicMember,
  type PublicStudioRichMember,
} from "./data/publicMember.js";
export {
  MemberIdentityActionError,
  normalizeMemberIdentityError,
  type MemberIdentityAuthority,
  type MemberIdentityStateListener,
} from "./logic/memberIdentityAuthority.js";
export {
  STUDIO_RICH_FIREBASE_ENVIRONMENT_KEYS,
  StudioRichFirebaseConfigurationError,
  type StudioRichFirebaseEnvironment,
} from "./firebase/firebaseConfig.js";
export { createFirebaseMemberIdentityAuthority } from "./firebase/createFirebaseMemberIdentityAuthority.js";
export { createFirebaseArtworkRepository } from "./firebase/createFirebaseArtworkRepository.js";
