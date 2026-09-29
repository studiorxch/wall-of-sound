/**
 * Event Radio Turnkey Operations V1 -- the minimum STUDIORICH-OWNED data
 * shape that lets an authorized operator change which already-published
 * RADIO program an event uses, in which playback mode, and (for CLOCK
 * mode) when it started -- entirely through data, never a source-code
 * edit, AI action, build, or deploy. See RadioWebManifest (radioWebBundleTypes.ts)
 * for the actual published-bundle format this references; this module never
 * duplicates that catalog, only points at it by id.
 */

/**
 * One already-published RADIO bundle an operator can choose for an event --
 * human-readable, never a raw manifest URL the operator has to type.
 *
 * Batch 02F -- RADIO Program Package Identity Contract: `stationId` +
 * `bundleVersion` are the canonical, immutable RADIO Package identity
 * (`stationId === RadioWebManifest.stationId === RadioPlaylist.id`,
 * `bundleVersion === RadioWebManifest.bundleVersion` -- see
 * radioWebBundleTypes.ts). Both OPTIONAL: existing manually-authored
 * `radioPrograms` documents carry only `manifestBaseUrl` and remain fully
 * valid. Never derived from `manifestBaseUrl`, `title`, or any URL slug --
 * only ever read verbatim from a document that actually has them.
 *
 * RADIO-03 (batch 0929-5) -- both `createRadioProgram` (Batch 02I) and now
 * `updateRadioProgram` write these fields; the "no application write path
 * yet" note above describes this type's original Batch 02F introduction
 * only and is no longer current.
 */
export interface RadioProgramSummary {
  readonly id: string;
  readonly title: string;
  /** Base URL the bundle's radio-manifest.json and audio/artwork are relative to -- e.g. "/radio-web-export/soft-motion-radio/v1/". Always ends with "/". */
  readonly manifestBaseUrl: string;
  readonly trackCount: number;
  readonly totalDurationSeconds: number;
  /** Canonical RADIO Package identity, part 1 -- `RadioWebManifest.stationId` (= `RadioPlaylist.id`). Absent on legacy/manually-authored documents. */
  readonly stationId?: string;
  /** Canonical RADIO Package identity, part 2 -- `RadioWebManifest.bundleVersion`. Absent on legacy/manually-authored documents. */
  readonly bundleVersion?: number;
}

export type EventPlaybackMode = "personal" | "clock";
export type EventProgramEndPolicy = "stop" | "repeat";

/**
 * The smallest useful event lifecycle (requirement 9): a listener must
 * never receive an operator's still-being-configured program. Only
 * "active" is ever resolved by a client -- "inactive"/"ready" both mean
 * "no program available right now" from the listener's point of view,
 * distinguished only for the operator's own benefit.
 */
export type EventStatus = "inactive" | "ready" | "active";

export interface EventProgramState {
  readonly programId: string | null;
  readonly playbackMode: EventPlaybackMode;
  /** Epoch milliseconds -- required and only meaningful for "clock" mode. */
  readonly startAtMs: number | null;
  readonly endPolicy: EventProgramEndPolicy;
  readonly status: EventStatus;
  readonly updatedAt: Date | null;
  /** The operator's own member id (Firebase Auth uid) -- an audit trail, never used for authorization (Firestore rules are the actual authority gate). */
  readonly updatedBy: string | null;
}

export interface SetEventProgramInput {
  readonly programId: string;
  readonly playbackMode: EventPlaybackMode;
  readonly startAtMs: number | null;
  readonly endPolicy: EventProgramEndPolicy;
  readonly status: EventStatus;
}

/**
 * Batch 02I -- Published Package -> RADIO Program Creation: the first
 * application-level (not Firestore-Console) way to create a
 * `radioPrograms/{programId}` document. Unlike `RadioProgramSummary`
 * (where `stationId`/`bundleVersion` are optional, for backward
 * compatibility with legacy hand-authored documents), a NEW
 * application-created Program always carries a complete package
 * assignment -- both fields are REQUIRED here, never optional, and never
 * inferred from `manifestBaseUrl`/title/slug. `programId` is deliberately
 * independent from `stationId` -- see `generateRadioProgramId`.
 */
export interface CreateRadioProgramInput {
  readonly programId: string;
  readonly title: string;
  readonly manifestBaseUrl: string;
  readonly trackCount: number;
  readonly totalDurationSeconds: number;
  readonly stationId: string;
  readonly bundleVersion: number;
}

/**
 * RADIO-03 (batch 0929-5) -- adopts a different already-published Package
 * version onto an EXISTING Program, preserving `programId` (and therefore
 * every Channel rotation slot/eventProgram reference to it) -- the
 * corrective counterpart to `createRadioProgram`. Same required-field
 * shape as `CreateRadioProgramInput` (firestore.rules' `radioPrograms`
 * `allow write` validates create and update identically; there is no
 * partial-patch write, the full field set is always resupplied). Never
 * mutates a published Package itself (`RadioWebExportRecord`/Sites
 * checkout) -- only which already-immutable version this Program's own
 * reference points at.
 */
export interface UpdateRadioProgramInput {
  readonly programId: string;
  readonly title: string;
  readonly manifestBaseUrl: string;
  readonly trackCount: number;
  readonly totalDurationSeconds: number;
  readonly stationId: string;
  readonly bundleVersion: number;
}

export interface EventRadioRepository {
  /** Every operator-selectable published program -- public read, matches the "PUBLIC/MEMBER read" half of this build's own authority rule. */
  listRadioPrograms(): Promise<readonly RadioProgramSummary[]>;
  /** The single active event configuration, or null if none has ever been set. */
  getEventProgram(): Promise<EventProgramState | null>;
  /** Authorized-operator-only in Firestore rules; VALIDATES before writing (requirement 19) -- a malformed config throws rather than silently activating. */
  setEventProgram(input: SetEventProgramInput, updatedByMemberId: string): Promise<void>;
  /**
   * Batch 02I -- authorized-operator-only in Firestore rules (same
   * `isEventOperator()` gate as every other `radioPrograms` write).
   * VALIDATES before writing, same posture as `setEventProgram`. NEVER
   * overwrites an existing document at `programId` -- a collision throws
   * rather than silently replacing a Program (see
   * `FirestoreEventRadioRepository`'s own transaction). Does not touch
   * `eventProgram/current` -- creating a Program never puts it on air.
   */
  createRadioProgram(input: CreateRadioProgramInput): Promise<RadioProgramSummary>;
  /**
   * RADIO-03 (batch 0929-5) -- authorized-operator-only in Firestore rules
   * (same `isEventOperator()` gate, same `allow write` block as create).
   * VALIDATES before writing. Requires the document to ALREADY exist --
   * the mirror-image guard of createRadioProgram's collision check --
   * `radio_program_not_found` if it doesn't, never silently creating one.
   * `programId` is never regenerated; every Channel rotation slot or
   * `eventProgram/current` reference to it keeps working unchanged.
   */
  updateRadioProgram(input: UpdateRadioProgramInput): Promise<RadioProgramSummary>;
}

/**
 * Same convention as `musicToRadioPlaylistSync.ts`'s own (module-private)
 * `genRadioPlaylistId` -- a fresh, unguessable, non-sequential id,
 * independent of `stationId`/title/slug on purpose (a title-derived or
 * stationId-derived id would tie Program identity to Package identity,
 * which this batch's own product decision explicitly forbids).
 */
export function generateRadioProgramId(): string {
  return `radprogram_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
