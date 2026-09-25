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
export type { ArtMaterialId, ArtSupplyId, ArtSupplySettings, DrawingSupplyId, DrawingWidthRange, MarkMaterialIdentity, PencilSupplySettings } from "./data/artSupplyTypes.js";
export {
  MARKER_SUPPLY, MOP_SUPPLY, PEN_SUPPLY, PENCIL_SUPPLY, PENCIL_ERASER_SUPPLY, SPRAY_SUPPLY, canEraseMaterial,
  DRAWING_SUPPLY_ORDER, DRAWING_WIDTH_RANGES, DRAWING_DEFAULT_COLORS,
} from "./data/artSupplyTypes.js";
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
export { createFirebaseEventRadioRepository } from "./firebase/createFirebaseEventRadioRepository.js";
export {
  validateSetEventProgramInput,
  validateCreateRadioProgramInput,
  RADIO_PROGRAMS_COLLECTION_PATH,
  EVENT_PROGRAM_DOCUMENT_PATH,
} from "./firebase/firestoreEventRadioRepository.js";
export {
  generateRadioProgramId,
  type CreateRadioProgramInput,
  type EventPlaybackMode,
  type EventProgramEndPolicy,
  type EventProgramState,
  type EventRadioRepository,
  type EventStatus,
  type RadioProgramSummary,
  type SetEventProgramInput,
} from "./data/eventRadioTypes.js";
export { createFirebaseRadioChannelRepository } from "./firebase/createFirebaseRadioChannelRepository.js";
export {
  validateCreateRadioChannelInput,
  validateUpdateRadioChannelInput,
  RADIO_CHANNELS_COLLECTION_PATH,
} from "./firebase/firestoreRadioChannelRepository.js";
export {
  type CreateRadioChannelInput,
  type RadioChannel,
  type RadioChannelRepository,
  type RadioChannelRotation,
  type RadioChannelStatus,
  type UpdateRadioChannelInput,
} from "./data/radioChannelTypes.js";
