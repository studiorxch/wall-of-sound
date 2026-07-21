// 0721_MUSIC_RADIO_Sectional_Loopchain_Player — pure builders for the
// local observation log. Stored for the operator's own reference only —
// never dashboarded, never phrased as a system verdict (doctrine §6).
// Pure — no DOM, no Node.

import type { LoopchainObservation, LoopchainObservationKind } from "../../data/radioLoopchainTypes";

function genObservationId(): string {
  return `loopchainobs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface BuildObservationInput {
  kind: LoopchainObservationKind;
  chainId: string;
  blockId?: string;
  junctionId?: string;
  plannedResidenceSeconds?: number;
  actualResidenceSeconds?: number;
  occurrenceCount?: number;
  note?: string;
}

function buildObservation(input: BuildObservationInput, now: string): LoopchainObservation {
  return {
    id: genObservationId(),
    kind: input.kind,
    chainId: input.chainId,
    blockId: input.blockId,
    junctionId: input.junctionId,
    plannedResidenceSeconds: input.plannedResidenceSeconds,
    actualResidenceSeconds: input.actualResidenceSeconds,
    occurrenceCount: input.occurrenceCount,
    note: input.note,
    recordedAt: now,
  };
}

export function recordChainPlayed(
  chainId: string,
  plannedResidenceSeconds: number,
  occurrenceCount: number,
  now: string = new Date().toISOString(),
): LoopchainObservation {
  return buildObservation({ kind: "chain_played", chainId, plannedResidenceSeconds, occurrenceCount }, now);
}

export function recordEarlyStop(
  chainId: string,
  actualResidenceSeconds: number,
  now: string = new Date().toISOString(),
): LoopchainObservation {
  return buildObservation({ kind: "early_stop", chainId, actualResidenceSeconds }, now);
}

export function recordOccurrenceSkip(
  chainId: string,
  blockId: string,
  now: string = new Date().toISOString(),
): LoopchainObservation {
  return buildObservation({ kind: "occurrence_skip", chainId, blockId }, now);
}

export function recordJunctionAudition(
  chainId: string,
  junctionId: string,
  now: string = new Date().toISOString(),
): LoopchainObservation {
  return buildObservation({ kind: "junction_audition", chainId, junctionId }, now);
}

export function recordEnduranceCompleted(
  chainId: string,
  actualResidenceSeconds: number,
  now: string = new Date().toISOString(),
): LoopchainObservation {
  return buildObservation({ kind: "endurance_completed", chainId, actualResidenceSeconds }, now);
}

export function recordChainDisposition(
  chainId: string,
  accepted: boolean,
  note?: string,
  now: string = new Date().toISOString(),
): LoopchainObservation {
  return buildObservation({ kind: accepted ? "chain_accepted" : "chain_abandoned", chainId, note }, now);
}
