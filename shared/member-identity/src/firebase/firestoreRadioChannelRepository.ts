import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, Timestamp, type Firestore } from "firebase/firestore";
import type {
  CreateRadioChannelInput,
  RadioChannel,
  RadioChannelRepository,
  RadioChannelRotation,
  RadioChannelStatus,
  UpdateRadioChannelInput,
} from "../data/radioChannelTypes.js";
import { RADIO_PROGRAMS_COLLECTION_PATH, decodeRadioProgram } from "./firestoreEventRadioRepository.js";

export const RADIO_CHANNELS_COLLECTION_PATH = "radioChannels";

const STATUSES: readonly RadioChannelStatus[] = ["active", "inactive"];
function isChannelStatus(value: unknown): value is RadioChannelStatus {
  return STATUSES.includes(value as RadioChannelStatus);
}

/**
 * RADIO-04D -- status-aware: an `inactive` Channel may have an empty
 * `programIds` (no default Program to fall back on outside a scheduled
 * window is a legitimate, intentional state, not a malformed document).
 * An `active` Channel still requires at least one default Program -- see
 * this batch's own recon on why (scheduled programming is already
 * structurally independent of this, per `radioScheduleBroadcastPriority.ts`;
 * this guardrail exists so "active" keeps meaning "has a real default
 * fallback," not because anything downstream would crash without it).
 */
function isValidRotationShape(rotation: RadioChannelRotation, status: RadioChannelStatus): boolean {
  if (!Number.isFinite(rotation.anchorAtMs)) return false;
  if (!Array.isArray(rotation.programIds)) return false;
  if (status === "active" && rotation.programIds.length === 0) return false;
  if (!rotation.programIds.every((id) => typeof id === "string" && id.length > 0)) return false;
  if (new Set(rotation.programIds).size !== rotation.programIds.length) return false;
  return true;
}

/**
 * Referenced-program validation lives here (the repository/application
 * boundary), never inside `channelRotation.ts`'s own pure resolver --
 * that module must never depend on Firestore. Every `programId` in the
 * rotation must correspond to a REAL, currently-decodable
 * `radioPrograms/{programId}` document; a rotation referencing an unknown
 * or deleted Program is rejected before it can ever be persisted.
 */
function assertValidRotation(rotation: RadioChannelRotation, status: RadioChannelStatus, knownProgramIds: ReadonlySet<string>): void {
  if (!isValidRotationShape(rotation, status)) throw new Error("invalid_radio_channel_rotation");
  for (const programId of rotation.programIds) {
    if (!knownProgramIds.has(programId)) throw new Error("invalid_radio_channel_program_reference");
  }
}

export function validateCreateRadioChannelInput(input: CreateRadioChannelInput, knownProgramIds: ReadonlySet<string>): void {
  if (!input.channelId) throw new Error("invalid_radio_channel_id");
  if (!input.title) throw new Error("invalid_radio_channel_title");
  if (!isChannelStatus(input.status)) throw new Error("invalid_radio_channel_status");
  assertValidRotation(input.rotation, input.status, knownProgramIds);
}

/**
 * `effectiveStatus` is the status the document will actually have AFTER
 * this update is applied -- `input.status ?? <current persisted status>`
 * -- never `input.status` alone: a rotation-only update (no `status` in
 * the payload) on an already-active Channel must still be validated
 * against "active," not silently treated as unconstrained just because
 * this particular call didn't happen to touch `status`.
 */
export function validateUpdateRadioChannelInput(
  input: UpdateRadioChannelInput,
  effectiveStatus: RadioChannelStatus,
  knownProgramIds: ReadonlySet<string>,
): void {
  if (!input.channelId) throw new Error("invalid_radio_channel_id");
  if (input.title !== undefined && !input.title) throw new Error("invalid_radio_channel_title");
  if (input.status !== undefined && !isChannelStatus(input.status)) throw new Error("invalid_radio_channel_status");
  if (input.rotation !== undefined) assertValidRotation(input.rotation, effectiveStatus, knownProgramIds);
}

/**
 * Whole-document reject-on-malformed (returns `null`), NOT
 * `decodeRadioProgram`'s field-by-field tolerant defaulting: a Channel's
 * `rotation.anchorAtMs`/`rotation.programIds` are interdependent -- there
 * is no sensible individual default for either half of a broken rotation,
 * unlike `getEventProgram`'s singleton fields (each of which has a real,
 * safe standalone default). A malformed Channel document is simply not
 * usable, not partially usable.
 */
export function decodeRadioChannel(channelId: string, data: Record<string, unknown>): RadioChannel | null {
  if (typeof data.title !== "string") return null;
  if (!isChannelStatus(data.status)) return null;
  const rotationRaw = data.rotation;
  if (typeof rotationRaw !== "object" || rotationRaw === null) return null;
  const anchorAtMs = (rotationRaw as Record<string, unknown>).anchorAtMs;
  const programIdsRaw = (rotationRaw as Record<string, unknown>).programIds;
  if (typeof anchorAtMs !== "number" || !Number.isFinite(anchorAtMs)) return null;
  if (!Array.isArray(programIdsRaw)) return null;
  // RADIO-04D -- an `inactive` Channel may legitimately have an empty
  // rotation; only reject the empty case for `active` (matches
  // isValidRotationShape's own status-aware rule above, so a document
  // that was valid to WRITE is never simultaneously invalid to READ).
  if (data.status === "active" && programIdsRaw.length === 0) return null;
  if (!programIdsRaw.every((id): id is string => typeof id === "string" && id.length > 0)) return null;
  const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null;
  const updatedBy = typeof data.updatedBy === "string" ? data.updatedBy : null;
  return {
    channelId,
    title: data.title,
    status: data.status,
    rotation: { anchorAtMs, programIds: programIdsRaw },
    updatedAt,
    updatedBy,
  };
}

export class FirestoreRadioChannelRepository implements RadioChannelRepository {
  constructor(private readonly firestore: Firestore) {}

  private async knownProgramIds(): Promise<ReadonlySet<string>> {
    const snapshot = await getDocs(collection(this.firestore, RADIO_PROGRAMS_COLLECTION_PATH));
    const ids = new Set<string>();
    for (const docSnapshot of snapshot.docs) {
      if (decodeRadioProgram(docSnapshot.id, docSnapshot.data())) ids.add(docSnapshot.id);
    }
    return ids;
  }

  async getRadioChannel(channelId: string): Promise<RadioChannel | null> {
    const snapshot = await getDoc(doc(this.firestore, RADIO_CHANNELS_COLLECTION_PATH, channelId));
    if (!snapshot.exists()) return null;
    return decodeRadioChannel(channelId, snapshot.data());
  }

  async listRadioChannels(): Promise<readonly RadioChannel[]> {
    const snapshot = await getDocs(collection(this.firestore, RADIO_CHANNELS_COLLECTION_PATH));
    const channels: RadioChannel[] = [];
    for (const docSnapshot of snapshot.docs) {
      const decoded = decodeRadioChannel(docSnapshot.id, docSnapshot.data());
      if (decoded) channels.push(decoded);
    }
    return channels;
  }

  /**
   * Create-only: a `channelId` collision throws
   * `radio_channel_id_collision` rather than overwriting -- same
   * `runTransaction` read-then-conditionally-write pattern
   * `createRadioProgram` already uses for identical reasons.
   */
  async createRadioChannel(input: CreateRadioChannelInput, createdByMemberId: string): Promise<RadioChannel> {
    const knownProgramIds = await this.knownProgramIds();
    validateCreateRadioChannelInput(input, knownProgramIds);
    const reference = doc(this.firestore, RADIO_CHANNELS_COLLECTION_PATH, input.channelId);
    await runTransaction(this.firestore, async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists()) throw new Error("radio_channel_id_collision");
      transaction.set(reference, {
        title: input.title,
        status: input.status,
        rotation: input.rotation,
        updatedAt: serverTimestamp(),
        updatedBy: createdByMemberId,
      });
    });
    const created = await this.getRadioChannel(input.channelId);
    if (!created) throw new Error("radio_channel_create_read_back_failed");
    return created;
  }

  /** The channel must already exist -- never creates one (mirrors createRadioChannel's own create-only guarantee, in the opposite direction). */
  async updateRadioChannel(input: UpdateRadioChannelInput, updatedByMemberId: string): Promise<RadioChannel> {
    const knownProgramIds = await this.knownProgramIds();
    const reference = doc(this.firestore, RADIO_CHANNELS_COLLECTION_PATH, input.channelId);
    await runTransaction(this.firestore, async (transaction) => {
      const existing = await transaction.get(reference);
      if (!existing.exists()) throw new Error("radio_channel_not_found");
      const current = decodeRadioChannel(input.channelId, existing.data());
      if (!current) throw new Error("radio_channel_existing_document_malformed");
      // Effective status AFTER this update lands -- never `input.status`
      // alone (see validateUpdateRadioChannelInput's own doc): a
      // rotation-only update on an already-active Channel must still be
      // validated against "active".
      validateUpdateRadioChannelInput(input, input.status ?? current.status, knownProgramIds);
      transaction.set(reference, {
        title: input.title ?? current.title,
        status: input.status ?? current.status,
        rotation: input.rotation ?? current.rotation,
        updatedAt: serverTimestamp(),
        updatedBy: updatedByMemberId,
      });
    });
    const updated = await this.getRadioChannel(input.channelId);
    if (!updated) throw new Error("radio_channel_update_read_back_failed");
    return updated;
  }
}
