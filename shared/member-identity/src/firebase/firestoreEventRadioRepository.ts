import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type {
  CreateRadioProgramInput,
  EventPlaybackMode,
  EventProgramEndPolicy,
  EventProgramState,
  EventRadioRepository,
  EventStatus,
  RadioProgramSummary,
  SetEventProgramInput,
  UpdateRadioProgramInput,
} from "../data/eventRadioTypes.js";

export const RADIO_PROGRAMS_COLLECTION_PATH = "radioPrograms";
export const EVENT_PROGRAM_DOCUMENT_PATH = "eventProgram/current";

const PLAYBACK_MODES: readonly EventPlaybackMode[] = ["personal", "clock"];
const END_POLICIES: readonly EventProgramEndPolicy[] = ["stop", "repeat"];
const STATUSES: readonly EventStatus[] = ["inactive", "ready", "active"];

function isPlaybackMode(value: unknown): value is EventPlaybackMode {
  return PLAYBACK_MODES.includes(value as EventPlaybackMode);
}
function isEndPolicy(value: unknown): value is EventProgramEndPolicy {
  return END_POLICIES.includes(value as EventProgramEndPolicy);
}
function isStatus(value: unknown): value is EventStatus {
  return STATUSES.includes(value as EventStatus);
}

/**
 * VALIDATION (requirement 19) -- an invalid operator submission throws
 * here, before any Firestore write, rather than ever reaching
 * `setDoc`/the last-known-active configuration. The caller (the operator
 * UI) is expected to surface this as a form error; it must never silently
 * fall through to activating a broken program.
 */
export function validateSetEventProgramInput(input: SetEventProgramInput, knownProgramIds: ReadonlySet<string>): void {
  if (!input.programId || !knownProgramIds.has(input.programId)) throw new Error("invalid_event_program_reference");
  if (!isPlaybackMode(input.playbackMode)) throw new Error("invalid_event_playback_mode");
  if (!isEndPolicy(input.endPolicy)) throw new Error("invalid_event_end_policy");
  if (!isStatus(input.status)) throw new Error("invalid_event_status");
  if (input.playbackMode === "clock" && input.status === "active") {
    if (input.startAtMs == null || !Number.isFinite(input.startAtMs)) throw new Error("invalid_event_clock_start_time");
  }
  if (input.startAtMs != null && !Number.isFinite(input.startAtMs)) throw new Error("invalid_event_clock_start_time");
}

/**
 * Batch 02I -- mirrors `validateSetEventProgramInput`'s own "throw before
 * any Firestore write" posture. Every field is REQUIRED (unlike
 * `decodeRadioProgram`'s optional-field tolerance on READ, which exists
 * only for legacy documents) -- a new application-created Program always
 * carries a complete package assignment.
 */
export function validateCreateRadioProgramInput(input: CreateRadioProgramInput): void {
  if (!input.programId) throw new Error("invalid_radio_program_id");
  if (!input.title) throw new Error("invalid_radio_program_title");
  if (!input.manifestBaseUrl) throw new Error("invalid_radio_program_manifest_base_url");
  if (!Number.isInteger(input.trackCount) || input.trackCount < 0) throw new Error("invalid_radio_program_track_count");
  if (!Number.isFinite(input.totalDurationSeconds) || input.totalDurationSeconds < 0) {
    throw new Error("invalid_radio_program_total_duration_seconds");
  }
  if (!input.stationId) throw new Error("invalid_radio_program_station_id");
  if (!Number.isInteger(input.bundleVersion) || input.bundleVersion <= 0) throw new Error("invalid_radio_program_bundle_version");
}

/**
 * RADIO-03 (batch 0929-5) -- identical field-level validation to
 * `validateCreateRadioProgramInput` (same required shape, same throw-
 * before-any-Firestore-write posture); kept as its own named function
 * rather than a call-through so the thrown error codes stay meaningful
 * (`invalid_radio_program_*`) regardless of which caller is validating.
 */
export function validateUpdateRadioProgramInput(input: UpdateRadioProgramInput): void {
  if (!input.programId) throw new Error("invalid_radio_program_id");
  if (!input.title) throw new Error("invalid_radio_program_title");
  if (!input.manifestBaseUrl) throw new Error("invalid_radio_program_manifest_base_url");
  if (!Number.isInteger(input.trackCount) || input.trackCount < 0) throw new Error("invalid_radio_program_track_count");
  if (!Number.isFinite(input.totalDurationSeconds) || input.totalDurationSeconds < 0) {
    throw new Error("invalid_radio_program_total_duration_seconds");
  }
  if (!input.stationId) throw new Error("invalid_radio_program_station_id");
  if (!Number.isInteger(input.bundleVersion) || input.bundleVersion <= 0) throw new Error("invalid_radio_program_bundle_version");
}

/**
 * Batch 02F -- `stationId`/`bundleVersion` are OPTIONAL and read verbatim
 * only: a malformed or absent value simply omits that field from the
 * decoded result (same "drop the bad optional field, don't reject the
 * whole document" convention this codebase already uses elsewhere, e.g.
 * `hasValidAuthoredZoom` in firestore.rules) -- it is NEVER derived from
 * `manifestBaseUrl`, `title`, or any other field on this document.
 */
export function decodeRadioProgram(id: string, data: Record<string, unknown>): RadioProgramSummary | null {
  if (typeof data.title !== "string" || typeof data.manifestBaseUrl !== "string") return null;
  if (!Number.isFinite(data.trackCount) || !Number.isFinite(data.totalDurationSeconds)) return null;
  const manifestBaseUrl = data.manifestBaseUrl.endsWith("/") ? data.manifestBaseUrl : `${data.manifestBaseUrl}/`;
  const stationId = typeof data.stationId === "string" && data.stationId.length > 0 ? data.stationId : undefined;
  const bundleVersion =
    typeof data.bundleVersion === "number" && Number.isInteger(data.bundleVersion) && data.bundleVersion > 0
      ? data.bundleVersion
      : undefined;
  return {
    id,
    title: data.title,
    manifestBaseUrl,
    trackCount: data.trackCount as number,
    totalDurationSeconds: data.totalDurationSeconds as number,
    stationId,
    bundleVersion,
  };
}

export class FirestoreEventRadioRepository implements EventRadioRepository {
  constructor(private readonly firestore: Firestore) {}

  async listRadioPrograms(): Promise<readonly RadioProgramSummary[]> {
    const snapshot = await getDocs(collection(this.firestore, RADIO_PROGRAMS_COLLECTION_PATH));
    const programs: RadioProgramSummary[] = [];
    for (const docSnapshot of snapshot.docs) {
      const decoded = decodeRadioProgram(docSnapshot.id, docSnapshot.data());
      if (decoded) programs.push(decoded);
    }
    return programs;
  }

  async getEventProgram(): Promise<EventProgramState | null> {
    const snapshot = await getDoc(doc(this.firestore, EVENT_PROGRAM_DOCUMENT_PATH));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    const programId = typeof data.programId === "string" ? data.programId : null;
    const playbackMode = isPlaybackMode(data.playbackMode) ? data.playbackMode : "personal";
    const startAtMs = typeof data.startAtMs === "number" && Number.isFinite(data.startAtMs) ? data.startAtMs : null;
    const endPolicy = isEndPolicy(data.endPolicy) ? data.endPolicy : "stop";
    const status = isStatus(data.status) ? data.status : "inactive";
    const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null;
    const updatedBy = typeof data.updatedBy === "string" ? data.updatedBy : null;
    return { programId, playbackMode, startAtMs, endPolicy, status, updatedAt, updatedBy };
  }

  /**
   * Batch 02I -- create-only: a `programId` collision throws
   * `radio_program_id_collision` rather than overwriting the existing
   * document. Uses the same `runTransaction` read-then-conditionally-write
   * pattern this package already uses for create-only safety elsewhere
   * (see `FirestoreArtworkRepository.appendOwnedArtworkMark`'s sibling
   * methods) rather than a bare `setDoc`, which would silently replace
   * an existing Program on an id collision.
   */
  async createRadioProgram(input: CreateRadioProgramInput): Promise<RadioProgramSummary> {
    validateCreateRadioProgramInput(input);
    const manifestBaseUrl = input.manifestBaseUrl.endsWith("/") ? input.manifestBaseUrl : `${input.manifestBaseUrl}/`;
    const reference = doc(this.firestore, RADIO_PROGRAMS_COLLECTION_PATH, input.programId);
    await runTransaction(this.firestore, async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists()) throw new Error("radio_program_id_collision");
      transaction.set(reference, {
        title: input.title,
        manifestBaseUrl,
        trackCount: input.trackCount,
        totalDurationSeconds: input.totalDurationSeconds,
        stationId: input.stationId,
        bundleVersion: input.bundleVersion,
      });
    });
    return {
      id: input.programId,
      title: input.title,
      manifestBaseUrl,
      trackCount: input.trackCount,
      totalDurationSeconds: input.totalDurationSeconds,
      stationId: input.stationId,
      bundleVersion: input.bundleVersion,
    };
  }

  /**
   * RADIO-03 (batch 0929-5) -- mirror-image guard of createRadioProgram's
   * own transaction: requires the document to ALREADY exist
   * (`radio_program_not_found` if not), never silently creating one on a
   * typo'd or stale `programId`. `programId` itself is never regenerated
   * -- the document at this exact path is overwritten in place with the
   * new package assignment, preserving every existing reference to it
   * (Channel rotation `programIds[]`, `eventProgram/current.programId`).
   */
  async updateRadioProgram(input: UpdateRadioProgramInput): Promise<RadioProgramSummary> {
    validateUpdateRadioProgramInput(input);
    const manifestBaseUrl = input.manifestBaseUrl.endsWith("/") ? input.manifestBaseUrl : `${input.manifestBaseUrl}/`;
    const reference = doc(this.firestore, RADIO_PROGRAMS_COLLECTION_PATH, input.programId);
    await runTransaction(this.firestore, async (transaction) => {
      const existing = await transaction.get(reference);
      if (!existing.exists()) throw new Error("radio_program_not_found");
      transaction.set(reference, {
        title: input.title,
        manifestBaseUrl,
        trackCount: input.trackCount,
        totalDurationSeconds: input.totalDurationSeconds,
        stationId: input.stationId,
        bundleVersion: input.bundleVersion,
      });
    });
    return {
      id: input.programId,
      title: input.title,
      manifestBaseUrl,
      trackCount: input.trackCount,
      totalDurationSeconds: input.totalDurationSeconds,
      stationId: input.stationId,
      bundleVersion: input.bundleVersion,
    };
  }

  async setEventProgram(input: SetEventProgramInput, updatedByMemberId: string): Promise<void> {
    const knownPrograms = await this.listRadioPrograms();
    validateSetEventProgramInput(input, new Set(knownPrograms.map((program) => program.id)));
    await setDoc(doc(this.firestore, EVENT_PROGRAM_DOCUMENT_PATH), {
      programId: input.programId,
      playbackMode: input.playbackMode,
      startAtMs: input.startAtMs,
      endPolicy: input.endPolicy,
      status: input.status,
      updatedAt: serverTimestamp(),
      updatedBy: updatedByMemberId,
    });
  }
}
