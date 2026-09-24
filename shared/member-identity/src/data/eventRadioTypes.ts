/**
 * Event Radio Turnkey Operations V1 -- the minimum STUDIORICH-OWNED data
 * shape that lets an authorized operator change which already-published
 * RADIO program an event uses, in which playback mode, and (for CLOCK
 * mode) when it started -- entirely through data, never a source-code
 * edit, AI action, build, or deploy. See RadioWebManifest (radioWebBundleTypes.ts)
 * for the actual published-bundle format this references; this module never
 * duplicates that catalog, only points at it by id.
 */

/** One already-published RADIO bundle an operator can choose for an event -- human-readable, never a raw manifest URL the operator has to type. */
export interface RadioProgramSummary {
  readonly id: string;
  readonly title: string;
  /** Base URL the bundle's radio-manifest.json and audio/artwork are relative to -- e.g. "/radio-web-export/soft-motion-radio/v1/". Always ends with "/". */
  readonly manifestBaseUrl: string;
  readonly trackCount: number;
  readonly totalDurationSeconds: number;
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

export interface EventRadioRepository {
  /** Every operator-selectable published program -- public read, matches the "PUBLIC/MEMBER read" half of this build's own authority rule. */
  listRadioPrograms(): Promise<readonly RadioProgramSummary[]>;
  /** The single active event configuration, or null if none has ever been set. */
  getEventProgram(): Promise<EventProgramState | null>;
  /** Authorized-operator-only in Firestore rules; VALIDATES before writing (requirement 19) -- a malformed config throws rather than silently activating. */
  setEventProgram(input: SetEventProgramInput, updatedByMemberId: string): Promise<void>;
}
