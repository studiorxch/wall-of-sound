// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §8/§15 — the RADIO
// playlist model: the primary preparation, core-version, and publication
// unit, linked back to its source MUSIC playlist. Literal types adopted
// verbatim from the spec. Pure — no DOM, no Node.
//
// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §2/§6 — cards
// render entirely from data snapshotted at send time (coverImage/
// accentColor/durationSeconds/title), never a live MUSIC lookup; and
// "PUBLISHED"/unpublishedAt track only local RADIO-side bookkeeping — no
// real web-delivery bridge exists yet (see radioPlaylistPublicationState.ts
// for the honest user-facing label mapping).

export type RadioPlaylistState =
  | "DRAFT"
  | "PREPARING"
  | "READY"
  | "PUBLISHED"
  | "RETIRED";

// 0718B_RADIO_Web_Publication_Asset_Export_Bridge §State model — curator
// approval is explicit, persisted, and attributable to the exact source
// bytes (sourceAssetHash, computed server-side) and Complete Song
// Intelligence revision (= CompleteSongAnalysis.updatedAt; no monotonic
// revision counter exists — disclosed deviation). If the source bytes
// change, the approval is STALE and never silently carries forward; a
// metadata-only MUSIC edit keeps the hash (and thus the approval) intact.
export type RadioEntryApproval = {
  approved: boolean;
  approvedAt?: string;
  sourceAssetHash?: string;
  songIntelligenceRevision?: string;
};

// 0718B — a playlist entry binds to an EXACT immutable RadioTrack package
// version. Never silently floats to a newer version; re-preparation
// rebinds only through the explicit prepare/prepare-new-version actions.
export type RadioTrackPackageBinding = {
  radioTrackId: string;
  packageVersion: number;
  sourceTrackId: string;
  sourceAssetHash: string;
  packageManifestHash: string;
  boundAt: string;
};

// 0718B — the derived per-entry preparation state (spec §State model).
// Derived by computeEntryPreparationState (radioEntryPreparation.ts) from
// the PERSISTED facts below (approval/trackBinding/lastPreparationError/
// includedInPublish) plus a live server verification result — never a
// UI-derived guess. PREPARING is transient batch-run state only.
export type RadioEntryPreparationState =
  | "NOT_APPROVED"
  | "NEEDS_PREPARATION"
  | "PREPARING"
  | "READY"
  | "STALE"
  | "FAILED"
  | "EXCLUDED";

// `id` is assigned once at creation (by musicToRadioPlaylistSync.ts) and
// never repositionally rebuilt from array index — unlike MUSIC's own
// TrackSlot.slotId, which IS rebuilt every mutation via
// reindexPlaylistSlots. Rebuilding this id would break locked-entry
// identity across a reorder, a footgun this build must not repeat.
export type RadioPlaylistEntry = {
  id: string;
  inboxItemId: string;
  order: number;
  locked: boolean;
  includedInPublish: boolean;
  stemPolicy: "none" | "requested" | "ready" | "failed";
  notes?: string;
  // 0718B — persisted domain state for full-track web preparation. All
  // additive/optional: pre-0718B entries simply classify as NOT_APPROVED.
  approval?: RadioEntryApproval;
  trackBinding?: RadioTrackPackageBinding;
  lastPreparationError?: { code: string; message: string; at: string };
};

// sourceMusicPlaylistRevision is a computed ordered-assigned-trackId-
// sequence signature (modeled on the existing optionsGeneratedFromTrackSignature
// pattern) — not a real MUSIC playlist revision number, since none exists.
// A published version is immutable; a later edit creates a new draft/
// version rather than mutating the published record (same doctrine as
// RadioLoopPackageManifest's own version history).
export type RadioPlaylist = {
  id: string;
  sourceMusicPlaylistId?: string;
  sourceMusicPlaylistRevision?: string;
  title: string;
  version: string;
  state: RadioPlaylistState;
  entries: RadioPlaylistEntry[];
  storageBudgetBytes?: number;
  estimatedPublishBytes: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  // 0718A §2 — snapshotted from sourcePlaylist at every explicit send (not
  // a live lookup); RADIO renders these unchanged until the next send even
  // if the MUSIC source is later renamed, re-covered, or deleted.
  coverImage?: import("./playProjectTypes").PlaylistImage;
  accentColor?: string;
  durationSeconds?: number;
  // 0718A §4/§6 — local-only publication bookkeeping. Never cleared by
  // computeUnpublishPatch (it's the historical "was marked ready at X"
  // fact); see radioPlaylistPublicationState.ts.
  unpublishedAt?: string;
};

// §15 — reserved for the future RADIO DJ performance engine. Not read or
// written anywhere in this build; kept here only so the future contract
// has a stable home.
export type ListenerIntent = {
  motion: number;
  energy: number;
  density: number;
  eventCharge: number;
  hold: number;
};
