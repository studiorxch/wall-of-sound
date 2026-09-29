import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp, writeBatch, Timestamp, type Firestore } from "firebase/firestore";
import type {
  CreateRadioScheduleBlockInput,
  RadioScheduleBlock,
  RadioScheduleBlockStatus,
  RadioScheduleRecurrence,
  RadioScheduleRecurrenceFrequency,
  RadioScheduleRepository,
} from "../data/radioScheduleTypes.js";
import { generateRadioScheduleBlockId } from "../data/radioScheduleTypes.js";

export const RADIO_SCHEDULE_BLOCKS_COLLECTION_PATH = "radioScheduleBlocks";

const FREQUENCIES: readonly RadioScheduleRecurrenceFrequency[] = ["none", "daily", "weekly"];
const STATUSES: readonly RadioScheduleBlockStatus[] = ["scheduled", "cancelled"];

function isFrequency(value: unknown): value is RadioScheduleRecurrenceFrequency {
  return FREQUENCIES.includes(value as RadioScheduleRecurrenceFrequency);
}
function isStatus(value: unknown): value is RadioScheduleBlockStatus {
  return STATUSES.includes(value as RadioScheduleBlockStatus);
}

export function validateCreateRadioScheduleBlockInput(input: CreateRadioScheduleBlockInput): void {
  if (!input.channelId) throw new Error("invalid_radio_schedule_channel_id");
  if (!input.programId) throw new Error("invalid_radio_schedule_program_id");
  if (!Number.isFinite(input.startAtMs)) throw new Error("invalid_radio_schedule_start");
  if (!Number.isFinite(input.endAtMs)) throw new Error("invalid_radio_schedule_end");
  if (input.endAtMs <= input.startAtMs) throw new Error("invalid_radio_schedule_end_before_start");
}

export function validateRecurrence(recurrence: RadioScheduleRecurrence | null): void {
  if (recurrence === null) return;
  if (!isFrequency(recurrence.frequency)) throw new Error("invalid_radio_schedule_recurrence_frequency");
  if (recurrence.frequency === "none") return;
  const hasUntil = recurrence.untilMs != null;
  const hasCount = recurrence.count != null;
  if (!hasUntil && !hasCount) throw new Error("invalid_radio_schedule_recurrence_unbounded");
  if (hasUntil && !Number.isFinite(recurrence.untilMs)) throw new Error("invalid_radio_schedule_recurrence_until");
  if (hasCount && (!Number.isInteger(recurrence.count) || (recurrence.count as number) <= 0)) {
    throw new Error("invalid_radio_schedule_recurrence_count");
  }
}

/**
 * Half-open interval overlap -- `[startAtMs, endAtMs)` -- so a block ending
 * exactly when another starts is NOT a conflict (matches how every other
 * time-window check in this codebase, e.g. Channel rotation's own
 * cumulative-offset walk, already treats a boundary).
 */
function overlaps(a: { startAtMs: number; endAtMs: number }, b: { startAtMs: number; endAtMs: number }): boolean {
  return a.startAtMs < b.endAtMs && b.startAtMs < a.endAtMs;
}

/**
 * Pure, exported so the same check backs both real Firestore writes here
 * and the operator UI's own pre-flight validation (RadioProgrammingView.tsx
 * calls this BEFORE ever hitting the network, for immediate feedback; this
 * repository re-checks it again server-round-trip-side as the real
 * authority -- the UI check is a courtesy, never the enforcement boundary).
 */
export function findScheduleConflicts(
  existing: readonly Pick<RadioScheduleBlock, "id" | "startAtMs" | "endAtMs" | "status">[],
  candidates: readonly { startAtMs: number; endAtMs: number }[],
): readonly { candidateIndex: number; conflictsWithId: string | null; conflictsWithCandidateIndex: number | null }[] {
  const conflicts: { candidateIndex: number; conflictsWithId: string | null; conflictsWithCandidateIndex: number | null }[] = [];
  const activeExisting = existing.filter((b) => b.status !== "cancelled");
  candidates.forEach((candidate, candidateIndex) => {
    const existingHit = activeExisting.find((b) => overlaps(b, candidate));
    if (existingHit) {
      conflicts.push({ candidateIndex, conflictsWithId: existingHit.id, conflictsWithCandidateIndex: null });
      return;
    }
    const siblingHitIndex = candidates.findIndex((other, otherIndex) => otherIndex !== candidateIndex && overlaps(other, candidate));
    if (siblingHitIndex !== -1) {
      conflicts.push({ candidateIndex, conflictsWithId: null, conflictsWithCandidateIndex: siblingHitIndex });
    }
  });
  return conflicts;
}

export function decodeRadioScheduleBlock(id: string, data: Record<string, unknown>): RadioScheduleBlock | null {
  if (typeof data.channelId !== "string" || !data.channelId) return null;
  if (typeof data.programId !== "string" || !data.programId) return null;
  if (typeof data.startAtMs !== "number" || !Number.isFinite(data.startAtMs)) return null;
  if (typeof data.endAtMs !== "number" || !Number.isFinite(data.endAtMs)) return null;
  if (!isStatus(data.status)) return null;
  const seriesId = typeof data.seriesId === "string" && data.seriesId.length > 0 ? data.seriesId : null;
  let recurrence: RadioScheduleRecurrence | null = null;
  if (typeof data.recurrence === "object" && data.recurrence !== null) {
    const raw = data.recurrence as Record<string, unknown>;
    if (isFrequency(raw.frequency)) {
      recurrence = {
        frequency: raw.frequency,
        untilMs: typeof raw.untilMs === "number" && Number.isFinite(raw.untilMs) ? raw.untilMs : undefined,
        count: typeof raw.count === "number" && Number.isInteger(raw.count) ? raw.count : undefined,
      };
    }
  }
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
  const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null;
  const updatedBy = typeof data.updatedBy === "string" ? data.updatedBy : null;
  return {
    id, channelId: data.channelId, programId: data.programId,
    startAtMs: data.startAtMs, endAtMs: data.endAtMs, status: data.status,
    seriesId, recurrence, createdAt, updatedAt, updatedBy,
  };
}

export class FirestoreRadioScheduleRepository implements RadioScheduleRepository {
  constructor(private readonly firestore: Firestore) {}

  async listScheduleBlocksForChannel(channelId: string): Promise<readonly RadioScheduleBlock[]> {
    const snapshot = await getDocs(
      query(collection(this.firestore, RADIO_SCHEDULE_BLOCKS_COLLECTION_PATH), where("channelId", "==", channelId)),
    );
    const blocks: RadioScheduleBlock[] = [];
    for (const docSnapshot of snapshot.docs) {
      const decoded = decodeRadioScheduleBlock(docSnapshot.id, docSnapshot.data());
      if (decoded) blocks.push(decoded);
    }
    return blocks;
  }

  /**
   * Re-reads the channel's current blocks INSIDE this call (not trusting a
   * caller-supplied snapshot) so the conflict check is against real,
   * current data at write time -- a courtesy UI pre-check happening
   * earlier can't substitute for this. Uses a batched write, not a
   * transaction (Firestore transactions can't span a >1-query read this
   * shape needs across arbitrarily many new docs cleanly) -- the
   * conflict-detection READ happens first, synchronously before any write,
   * so a same-channel double-submit race is still possible in principle
   * (same class of race every other RADIO repository method in this
   * codebase already accepts -- e.g. createRadioProgram's own
   * transaction only guards ITS OWN id collision, not a concurrent
   * semantic conflict) -- acceptable for a single-operator V1 tool.
   */
  async createScheduleBlocks(
    inputs: readonly CreateRadioScheduleBlockInput[],
    seriesId: string | null,
    recurrence: RadioScheduleRecurrence | null,
    createdByMemberId: string,
  ): Promise<readonly RadioScheduleBlock[]> {
    if (inputs.length === 0) throw new Error("invalid_radio_schedule_empty_batch");
    const channelId = inputs[0].channelId;
    if (!inputs.every((i) => i.channelId === channelId)) throw new Error("invalid_radio_schedule_mixed_channel_batch");
    inputs.forEach(validateCreateRadioScheduleBlockInput);
    validateRecurrence(recurrence);

    const existing = await this.listScheduleBlocksForChannel(channelId);
    const conflicts = findScheduleConflicts(existing, inputs);
    if (conflicts.length > 0) {
      throw new Error(`radio_schedule_conflict:${JSON.stringify(conflicts)}`);
    }

    const batch = writeBatch(this.firestore);
    const refs = inputs.map(() => doc(this.firestore, RADIO_SCHEDULE_BLOCKS_COLLECTION_PATH, generateRadioScheduleBlockId()));
    inputs.forEach((input, i) => {
      batch.set(refs[i], {
        channelId: input.channelId,
        programId: input.programId,
        startAtMs: input.startAtMs,
        endAtMs: input.endAtMs,
        status: "scheduled",
        seriesId,
        recurrence,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: createdByMemberId,
      });
    });
    await batch.commit();

    // Read-back mirrors createRadioProgram's own convention (return the
    // real, decoded record rather than trusting the just-sent payload) --
    // but avoids N extra reads: serverTimestamp() can't be known
    // client-side before commit, so createdAt/updatedAt are synthesized
    // as "now" here rather than re-fetched; every other field is returned
    // verbatim from what was just validated and written.
    const nowApprox = new Date();
    return inputs.map((input, i) => ({
      id: refs[i].id,
      channelId: input.channelId,
      programId: input.programId,
      startAtMs: input.startAtMs,
      endAtMs: input.endAtMs,
      status: "scheduled" as const,
      seriesId,
      recurrence,
      createdAt: nowApprox,
      updatedAt: nowApprox,
      updatedBy: createdByMemberId,
    }));
  }

  /**
   * The block must already exist -- never creates one. Cancellation only;
   * never a hard delete (see radioScheduleTypes.ts's own doc on why).
   * Uses `transaction.update()` (a partial merge), NOT `set()` with a
   * full re-sent payload -- `createdAt` (a Firestore Timestamp) is left
   * completely untouched rather than round-tripped through a decoded JS
   * `Date` and back, which would risk losing Firestore's sub-millisecond
   * precision and failing firestore.rules' own
   * `request.resource.data.createdAt == resource.data.createdAt`
   * exact-match check. Firestore rules evaluate `request.resource.data`
   * against the FULL resulting merged document even for a partial
   * `update()`, so the `hasAll`/`hasOnly` field-shape check still applies
   * correctly.
   */
  async cancelScheduleBlock(blockId: string, updatedByMemberId: string): Promise<void> {
    const reference = doc(this.firestore, RADIO_SCHEDULE_BLOCKS_COLLECTION_PATH, blockId);
    await runTransaction(this.firestore, async (transaction) => {
      const existing = await transaction.get(reference);
      if (!existing.exists()) throw new Error("radio_schedule_block_not_found");
      const current = decodeRadioScheduleBlock(blockId, existing.data());
      if (!current) throw new Error("radio_schedule_block_malformed");
      transaction.update(reference, {
        status: "cancelled",
        updatedAt: serverTimestamp(),
        updatedBy: updatedByMemberId,
      });
    });
  }
}
