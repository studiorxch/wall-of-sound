import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type {
  EventPlaybackMode,
  EventProgramEndPolicy,
  EventProgramState,
  EventRadioRepository,
  EventStatus,
  RadioProgramSummary,
  SetEventProgramInput,
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

function decodeRadioProgram(id: string, data: Record<string, unknown>): RadioProgramSummary | null {
  if (typeof data.title !== "string" || typeof data.manifestBaseUrl !== "string") return null;
  if (!Number.isFinite(data.trackCount) || !Number.isFinite(data.totalDurationSeconds)) return null;
  const manifestBaseUrl = data.manifestBaseUrl.endsWith("/") ? data.manifestBaseUrl : `${data.manifestBaseUrl}/`;
  return {
    id,
    title: data.title,
    manifestBaseUrl,
    trackCount: data.trackCount as number,
    totalDurationSeconds: data.totalDurationSeconds as number,
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
