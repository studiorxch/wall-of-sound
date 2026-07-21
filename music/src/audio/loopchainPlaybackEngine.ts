// 0721_MUSIC_RADIO_Sectional_Loopchain_Player §7 — discrete-occurrence,
// occurrence-local playback engine. Every repetition of every block is its
// own scheduled occurrence with its own future AudioContext start time,
// source offset/duration, and fade envelopes; two logical voices alternate
// which upcoming occurrence they're responsible for scheduling next, but
// every occurrence gets its OWN freshly-created AudioBufferSourceNode +
// GainNode pair — node-pair ownership never transfers between occurrences,
// so an occurrence stays independently stoppable/envelope-safe even while
// an adjacent one is mid-fade.
//
// Split like DualDeckPlaybackEngine.ts/gainEnvelope.ts: the TIMELINE MATH
// below (buildLoopchainSchedule, occurrencesDueForScheduling, assignVoice)
// is pure and fully unit tested. The AudioContext-driving class
// (LoopchainPlaybackEngine) is real node-graph wiring, verified live in
// the browser rather than deeply unit tested — the same split this
// codebase already uses for DualDeckPlaybackEngine.ts vs its own pure
// gainEnvelope.ts math.

import type { LoopchainBlock, LoopchainJunction } from "../data/radioLoopchainTypes";
import { expandBlockToOccurrences, LoopchainExpansionError } from "../logic/radio/radioLoopchainExpansion";
import { gainAtContextTime, makeFadeInEnvelope, makeFadeOutEnvelope } from "./gainEnvelope";
import type { GainEnvelope } from "./dualDeckTypes";

export interface LoopchainBlockPlan {
  block: LoopchainBlock;
  sourceTrackId: string;
  cycleDurationSeconds: number;
  sourceOffsetSeconds: number;
}

// One concrete, scheduled repetition of one block. `chainStartSeconds`/
// `chainEndSeconds` are relative to the chain's own t=0 (the moment
// playback begins) — the caller anchors this to a real AudioContext time
// when actually scheduling nodes.
export interface ScheduledOccurrence {
  occurrenceId: string;
  globalIndex: number;
  blockId: string;
  occurrenceIndexInBlock: number;
  sourceTrackId: string;
  sourceOffsetSeconds: number;
  sourceDurationSeconds: number;
  chainStartSeconds: number;
  chainEndSeconds: number;
  // Envelope timing is relative to chain t=0, same as chainStart/EndSeconds
  // — undefined fade-in means "start at full gain" (the very first
  // occurrence in the chain); undefined fade-out means "no scheduled
  // fade-out" (the very last occurrence — exact-timing exit-boundary
  // design is out of scope for this build).
  fadeInDurationSeconds?: number;
  fadeOutDurationSeconds?: number;
  voice: "A" | "B";
}

export interface LoopchainSchedule {
  occurrences: ScheduledOccurrence[];
  totalChainDurationSeconds: number;
}

export class LoopchainScheduleError extends Error {}

function genOccurrenceId(blockId: string, occurrenceIndexInBlock: number): string {
  return `${blockId}::occ${occurrenceIndexInBlock}`;
}

// Two logical voices alternate SCHEDULING RESPONSIBILITY across the whole
// chain (by global occurrence order, not per-block) — this is only a
// bookkeeping label; it never implies shared node ownership.
export function assignVoice(globalIndex: number): "A" | "B" {
  return globalIndex % 2 === 0 ? "A" : "B";
}

// Builds the full chain timeline: within a block, consecutive occurrences
// overlap by the block's OWN crossfadeDurationSeconds (self-loop repeat);
// between two different blocks, the first occurrence of the next block
// overlaps the last occurrence of the previous block by THAT junction's
// crossfadeDurationSeconds. Junctions are looked up by exact block-id
// pair — a chain with a missing junction between two adjacent blocks is a
// caller/reconciliation bug, surfaced as an error rather than silently
// defaulting to a guessed crossfade.
export function buildLoopchainSchedule(blockPlans: LoopchainBlockPlan[], junctions: LoopchainJunction[]): LoopchainSchedule {
  if (blockPlans.length === 0) return { occurrences: [], totalChainDurationSeconds: 0 };

  const junctionByPair = new Map(junctions.map((j) => [`${j.outgoingBlockId}::${j.incomingBlockId}`, j]));
  const occurrences: ScheduledOccurrence[] = [];
  let globalIndex = 0;
  let cursorSeconds = 0;
  let chainEnd = 0;

  for (let blockIdx = 0; blockIdx < blockPlans.length; blockIdx++) {
    const plan = blockPlans[blockIdx];
    let expansion;
    try {
      expansion = expandBlockToOccurrences(plan.block, plan.cycleDurationSeconds, plan.sourceOffsetSeconds);
    } catch (err) {
      if (err instanceof LoopchainExpansionError) {
        throw new LoopchainScheduleError(`block ${plan.block.id}: ${err.message}`);
      }
      throw err;
    }

    // The junction crossfade INTO this block's first occurrence (undefined
    // for the very first block in the chain — nothing precedes it).
    let incomingJunctionCrossfade: number | undefined;
    if (blockIdx > 0) {
      const prevBlockId = blockPlans[blockIdx - 1].block.id;
      const junction = junctionByPair.get(`${prevBlockId}::${plan.block.id}`);
      if (!junction) {
        throw new LoopchainScheduleError(`missing junction between adjacent blocks ${prevBlockId} and ${plan.block.id}`);
      }
      incomingJunctionCrossfade = junction.crossfadeDurationSeconds;
      // The previous block's LAST occurrence (already pushed) fades out
      // over this same junction crossfade.
      const prevOccurrence = occurrences[occurrences.length - 1];
      prevOccurrence.fadeOutDurationSeconds = incomingJunctionCrossfade;
      cursorSeconds = prevOccurrence.chainStartSeconds + (prevOccurrence.sourceDurationSeconds - incomingJunctionCrossfade);
    }

    for (let occIdx = 0; occIdx < expansion.occurrenceCount; occIdx++) {
      const chainStartSeconds = cursorSeconds;
      const occurrence: ScheduledOccurrence = {
        occurrenceId: genOccurrenceId(plan.block.id, occIdx),
        globalIndex,
        blockId: plan.block.id,
        occurrenceIndexInBlock: occIdx,
        sourceTrackId: plan.sourceTrackId,
        sourceOffsetSeconds: plan.sourceOffsetSeconds,
        sourceDurationSeconds: plan.cycleDurationSeconds,
        chainStartSeconds,
        chainEndSeconds: chainStartSeconds + plan.cycleDurationSeconds,
        fadeInDurationSeconds: occIdx === 0 ? incomingJunctionCrossfade : plan.block.crossfadeDurationSeconds,
        voice: assignVoice(globalIndex),
      };
      occurrences.push(occurrence);
      chainEnd = Math.max(chainEnd, occurrence.chainEndSeconds);
      globalIndex++;

      if (occIdx < expansion.occurrenceCount - 1) {
        // Self-loop repeat: the NEXT occurrence in this block starts
        // `block.crossfadeDurationSeconds` before this one ends, and this
        // occurrence fades out over that same window.
        occurrence.fadeOutDurationSeconds = plan.block.crossfadeDurationSeconds;
        cursorSeconds = chainStartSeconds + (plan.cycleDurationSeconds - plan.block.crossfadeDurationSeconds);
      }
    }
  }

  return { occurrences, totalChainDurationSeconds: chainEnd };
}

// Which occurrences must be scheduled NOW so their AudioContext start time
// falls within the lookahead window from the current chain-relative
// playhead — the standard step-sequencer lookahead pattern, expressed as
// pure data in/data out so it's testable without a real AudioContext.
export function occurrencesDueForScheduling(
  schedule: LoopchainSchedule,
  chainElapsedSeconds: number,
  lookaheadSeconds: number,
  alreadyScheduledOccurrenceIds: ReadonlySet<string>,
): ScheduledOccurrence[] {
  const horizon = chainElapsedSeconds + lookaheadSeconds;
  return schedule.occurrences.filter((occ) =>
    !alreadyScheduledOccurrenceIds.has(occ.occurrenceId) &&
    occ.chainStartSeconds < horizon &&
    occ.chainEndSeconds > chainElapsedSeconds);
}

// Builds the pair of gain envelopes (relative to chain t=0, same as
// ScheduledOccurrence's own timing fields) an occurrence needs — reusing
// gainEnvelope.ts's pure equal-power curve math, never a bespoke curve.
export function buildOccurrenceEnvelopes(occurrence: ScheduledOccurrence): { fadeIn?: GainEnvelope; fadeOut?: GainEnvelope } {
  return {
    fadeIn: occurrence.fadeInDurationSeconds
      ? makeFadeInEnvelope(occurrence.chainStartSeconds, occurrence.fadeInDurationSeconds)
      : undefined,
    fadeOut: occurrence.fadeOutDurationSeconds
      ? makeFadeOutEnvelope(occurrence.chainEndSeconds - occurrence.fadeOutDurationSeconds, occurrence.fadeOutDurationSeconds)
      : undefined,
  };
}

export { gainAtContextTime };

// ── Real AudioContext-driving engine — live-verified, not deeply unit
// tested (see file header). Every occurrence gets a fresh node pair; the
// lookahead tick reuses occurrencesDueForScheduling above so its decision
// logic stays identical to what the pure tests already prove correct.

export interface LoopchainEngineOptions {
  audioContext: AudioContext;
  destination?: AudioNode;
  lookaheadSeconds?: number;
  tickIntervalMs?: number;
}

interface ActiveOccurrenceNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class LoopchainPlaybackEngine {
  private ctx: AudioContext;
  private destination: AudioNode;
  private lookaheadSeconds: number;
  private tickIntervalMs: number;
  private timerId: number | null = null;
  private schedule: LoopchainSchedule | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private chainStartContextTime = 0;
  private scheduledOccurrenceIds = new Set<string>();
  private activeNodes = new Map<string, ActiveOccurrenceNodes>();
  private playing = false;
  private pausedAtChainElapsedSeconds: number | null = null;

  constructor(opts: LoopchainEngineOptions) {
    this.ctx = opts.audioContext;
    this.destination = opts.destination ?? opts.audioContext.destination;
    this.lookaheadSeconds = opts.lookaheadSeconds ?? 2;
    this.tickIntervalMs = opts.tickIntervalMs ?? 200;
  }

  setBuffer(sourceTrackId: string, buffer: AudioBuffer) {
    this.buffers.set(sourceTrackId, buffer);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  chainElapsedSeconds(): number {
    if (this.pausedAtChainElapsedSeconds != null) return this.pausedAtChainElapsedSeconds;
    if (!this.playing) return 0;
    return this.ctx.currentTime - this.chainStartContextTime;
  }

  play(schedule: LoopchainSchedule) {
    this.stop();
    this.schedule = schedule;
    this.scheduledOccurrenceIds = new Set();
    this.activeNodes = new Map();
    // A short lead so the very first occurrence's own scheduled start is
    // never in the past relative to ctx.currentTime.
    this.chainStartContextTime = this.ctx.currentTime + 0.05;
    this.playing = true;
    this.tick();
    this.timerId = window.setInterval(() => this.tick(), this.tickIntervalMs);
  }

  // Freezes the chain-elapsed position and silences every currently active
  // occurrence. Disclosed limitation: any occurrence mid-playback at the
  // moment of pause does NOT resume its own remaining tail on resume() —
  // it is treated as already consumed, and playback continues from
  // whichever occurrence covers the resumed position. Exact mid-occurrence
  // resume is explicitly out of scope for this prototype's exit-boundary
  // design.
  pause() {
    if (!this.playing) return;
    this.pausedAtChainElapsedSeconds = this.chainElapsedSeconds();
    this.playing = false;
    if (this.timerId != null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    for (const nodes of this.activeNodes.values()) {
      try { nodes.source.stop(); } catch { /* already stopped */ }
      nodes.source.disconnect();
      nodes.gain.disconnect();
    }
    this.activeNodes = new Map();
  }

  resume() {
    if (this.playing || this.pausedAtChainElapsedSeconds == null || !this.schedule) return;
    this.chainStartContextTime = this.ctx.currentTime - this.pausedAtChainElapsedSeconds;
    this.pausedAtChainElapsedSeconds = null;
    this.playing = true;
    this.tick();
    this.timerId = window.setInterval(() => this.tick(), this.tickIntervalMs);
  }

  stop() {
    this.playing = false;
    this.pausedAtChainElapsedSeconds = null;
    if (this.timerId != null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    for (const nodes of this.activeNodes.values()) {
      try { nodes.source.stop(); } catch { /* already stopped */ }
      nodes.source.disconnect();
      nodes.gain.disconnect();
    }
    this.activeNodes = new Map();
    this.scheduledOccurrenceIds = new Set();
    this.schedule = null;
  }

  private tick() {
    if (!this.playing || !this.schedule) return;
    const elapsed = this.chainElapsedSeconds();
    const due = occurrencesDueForScheduling(this.schedule, elapsed, this.lookaheadSeconds, this.scheduledOccurrenceIds);
    for (const occurrence of due) {
      this.scheduleOccurrence(occurrence);
      this.scheduledOccurrenceIds.add(occurrence.occurrenceId);
    }
    if (elapsed >= this.schedule.totalChainDurationSeconds + this.lookaheadSeconds) {
      this.stop();
    }
  }

  // Every call mints a BRAND NEW AudioBufferSourceNode + GainNode pair —
  // never a shared/reused node across occurrences (correction #4). Two
  // occurrences may be audibly overlapping right now (mid-crossfade) with
  // zero risk of one occurrence's automation clobbering the other's, since
  // neither node is ever touched again after this function returns except
  // by its own occurrence's cleanup on `stop()`.
  private scheduleOccurrence(occurrence: ScheduledOccurrence) {
    const buffer = this.buffers.get(occurrence.sourceTrackId);
    if (!buffer) return; // source not decoded — caller's setBuffer step failed; skip rather than throw mid-playback

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    source.connect(gain);
    gain.connect(this.destination);

    const startContextTime = this.chainStartContextTime + occurrence.chainStartSeconds;
    const { fadeIn, fadeOut } = buildOccurrenceEnvelopes(occurrence);
    gain.gain.setValueAtTime(fadeIn ? 0 : 1, startContextTime);
    if (fadeIn) {
      gain.gain.linearRampToValueAtTime(1, this.chainStartContextTime + fadeIn.endTimeContextSeconds);
    }
    if (fadeOut) {
      gain.gain.setValueAtTime(1, this.chainStartContextTime + fadeOut.startTimeContextSeconds);
      gain.gain.linearRampToValueAtTime(0, this.chainStartContextTime + fadeOut.endTimeContextSeconds);
    }

    source.start(startContextTime, occurrence.sourceOffsetSeconds, occurrence.sourceDurationSeconds);
    const key = occurrence.occurrenceId;
    this.activeNodes.set(key, { source, gain });
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.activeNodes.delete(key);
    };
  }
}
