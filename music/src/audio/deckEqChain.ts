// DJ Transition Engine (0722D) — per-deck 3-band EQ insert. Spliced into
// DualDeckPlaybackEngine's existing gain->destination signal path ONLY when
// an authorized active DJ plan actually needs it, and removed (true graph-
// level bypass, not unity-gain-through) the moment it doesn't. Legacy, off,
// and shadow modes never call any of the splice functions here — the chain
// is never even instantiated for them, so their signal path is byte-for-
// byte identical to before this build.
//
// Split top/bottom like gainEnvelope.ts / loopchainPlaybackEngine.ts: pure
// automation-event math here (tested), the actual AudioNode wiring is a
// thin, live-verified-only set of functions (no AudioContext/BiquadFilterNode
// in this repo's node test environment — see dualDeckPlayback.test.ts's own
// header comment for the established precedent).

import type { EqPoint } from "../data/djTransitionTypes";

export type EqBand = "low" | "mid" | "high";

// BiquadFilterNode.gain for lowshelf/highshelf/peaking is specified directly
// in dB by the Web Audio spec — no linear conversion needed to drive the
// node itself. Clamped to a sane rehearsal range; doctrine §8's ~4-6dB
// headroom target means anything far outside this is already a modeling
// error, never a legitimate musical value.
export const EQ_GAIN_DB_MIN = -24;
export const EQ_GAIN_DB_MAX = 12;

export function clampEqGainDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(EQ_GAIN_DB_MIN, Math.min(EQ_GAIN_DB_MAX, db));
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(1, progress));
}

export interface EqAutomationEvent {
  band: EqBand;
  timeContextSeconds: number;
  gainDb: number;
}

// Converts progress-relative EqPoint[] into absolute-context-time,
// clamped, monotonically-increasing automation events — never scheduled
// in the past, never a duplicate/zero-length/out-of-order ramp. Points are
// sorted by progress first so a caller-supplied out-of-order array can't
// produce a backwards ramp.
export function buildEqAutomationEvents(
  points: EqPoint[],
  startContextTimeSeconds: number,
  durationSeconds: number,
  nowContextTimeSeconds: number,
): EqAutomationEvent[] {
  const safeStart = Math.max(startContextTimeSeconds, nowContextTimeSeconds);
  const safeDuration = Math.max(0, durationSeconds);
  const sorted = [...points].sort((a, b) => a.progress - b.progress);

  const events: EqAutomationEvent[] = [];
  const lastTimeByBand: Partial<Record<EqBand, number>> = {};

  for (const point of sorted) {
    const t = safeStart + clampProgress(point.progress) * safeDuration;
    (["low", "mid", "high"] as const).forEach((band) => {
      const gainDb = clampEqGainDb(band === "low" ? point.lowDb : band === "mid" ? point.midDb : point.highDb);
      const prevTime = lastTimeByBand[band];
      // Never a duplicate or backwards-in-time event for the same band —
      // AudioParam automation curves require strictly increasing times.
      if (prevTime != null && t <= prevTime) return;
      lastTimeByBand[band] = t;
      events.push({ band, timeContextSeconds: t, gainDb });
    });
  }
  return events;
}

export function dbToLinearGain(db: number): number {
  return Math.pow(10, db / 20);
}

const BASS_OWNERSHIP_TOLERANCE = 0.02;

// The invariant the resolver's mirrored bass-transfer curve (djTransition
// AutomationDefaults.ts's managedBassEq) is built to guarantee: at any
// instant, the two decks' low-band linear gains sum to the same constant —
// one dominant bass source at a time, never a hole, never a collision.
export function bassOwnershipSum(outgoingLowDb: number, incomingLowDb: number): number {
  return dbToLinearGain(outgoingLowDb) + dbToLinearGain(incomingLowDb);
}

export function isBassOwnershipWithinTolerance(sum: number, expectedConstant: number, tolerance = BASS_OWNERSHIP_TOLERANCE): boolean {
  return Math.abs(sum - expectedConstant) <= tolerance;
}

// ── Live AudioNode wiring — not unit-testable in this repo's node test
// environment (no AudioContext/BiquadFilterNode); verified live in the
// browser per this build's completion report. ─────────────────────────────

export interface DeckEqChainNodes {
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  engaged: boolean;
}

const LOW_SHELF_FREQUENCY_HZ = 200;
const MID_PEAK_FREQUENCY_HZ = 1000;
const HIGH_SHELF_FREQUENCY_HZ = 4000;

export function createDeckEqChain(ctx: AudioContext): DeckEqChainNodes {
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = LOW_SHELF_FREQUENCY_HZ;
  low.gain.value = 0;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = MID_PEAK_FREQUENCY_HZ;
  mid.Q.value = 1;
  mid.gain.value = 0;

  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = HIGH_SHELF_FREQUENCY_HZ;
  high.gain.value = 0;

  low.connect(mid).connect(high);
  return { low, mid, high, engaged: false };
}

// True bypass: physically disconnects `source` from `destination` and
// reconnects it through the EQ chain. The chain is not in the signal path
// at all until this runs — unity gain sitting in a connected chain is
// explicitly NOT treated as equivalent to bypass anywhere in this build.
export function spliceDeckEqChainIn(chain: DeckEqChainNodes, source: AudioNode, destination: AudioNode): void {
  if (chain.engaged) return;
  source.disconnect(destination);
  source.connect(chain.low);
  chain.high.connect(destination);
  chain.engaged = true;
}

// The inverse: removes the chain from the graph entirely and restores the
// direct source->destination connection legacy/off/shadow modes always use.
export function bypassDeckEqChain(chain: DeckEqChainNodes, source: AudioNode, destination: AudioNode): void {
  if (!chain.engaged) return;
  source.disconnect(chain.low);
  chain.high.disconnect(destination);
  source.connect(destination);
  chain.engaged = false;
}

export function scheduleDeckEqAutomation(chain: DeckEqChainNodes, events: EqAutomationEvent[]): void {
  for (const event of events) {
    const node = event.band === "low" ? chain.low : event.band === "mid" ? chain.mid : chain.high;
    node.gain.linearRampToValueAtTime(event.gainDb, event.timeContextSeconds);
  }
}

export function cancelDeckEqAutomation(chain: DeckEqChainNodes, atContextTimeSeconds: number): void {
  (["low", "mid", "high"] as const).forEach((band) => {
    const node = chain[band];
    node.gain.cancelScheduledValues(atContextTimeSeconds);
    node.gain.setValueAtTime(0, atContextTimeSeconds);
  });
}

// Full teardown — disconnects every added node so nothing is retained after
// the deck/engine is destroyed. Safe to call whether or not the chain is
// currently engaged (bypassed chains still hold their own internal
// low->mid->high connections that must be released).
export function teardownDeckEqChain(chain: DeckEqChainNodes, source: AudioNode, destination: AudioNode): void {
  if (chain.engaged) {
    try { source.disconnect(chain.low); } catch { /* already disconnected */ }
    try { chain.high.disconnect(destination); } catch { /* already disconnected */ }
  }
  try { chain.low.disconnect(chain.mid); } catch { /* already disconnected */ }
  try { chain.mid.disconnect(chain.high); } catch { /* already disconnected */ }
  chain.engaged = false;
}
