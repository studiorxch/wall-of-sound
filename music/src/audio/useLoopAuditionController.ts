// 0714S_MUSIC_Looper_Transport_Musical_Grid_And_Canonical_Segmentation —
// loop-audition playback authority (§5-§9). This hook must be instantiated
// ONCE at the App root (never inside a page component that unmounts on
// navigation) so its playback and session state survive navigating away
// from the Sectional Looper — the exact defect this build exists to fix
// ("loop preview audio can continue after navigation while controls
// disappear").
//
// 0715F_MUSIC_Sample_Accurate_Loop_Audition_And_Playhead_Synchronization —
// rebuilds the internal engine on Web Audio (AudioBufferSourceNode with
// native `loop`/`loopStart`/`loopEnd`, sample-accurate in the browser's
// audio thread, independent of JS/rAF timing) instead of the previous
// HTMLAudioElement + manual `ontimeupdate` seek-back. The external
// `LoopAuditionController` shape stays close to before so LoopAuditionBar.tsx
// and App.tsx's wiring need no structural changes. An explicit
// HTMLAudioElement fallback is kept (not deleted) for when Web Audio decode
// is unavailable (§14) — never silently presented as equivalent.
//
// Does not touch the dual-deck engine's own PlaybackAuthority
// (audio/dualDeckTypes.ts) — protected scope (§38 / 0715F §4). Mutual
// exclusion with standard/dual-deck playback is the CALLER's responsibility
// (via onAcquire/onRelease callbacks), exactly like the pre-existing
// handleBeforeLoopPreview pattern this replaces.

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoopAuditionSession, LoopPreviewMode } from "../data/loopTypes";
import {
  frameToSeconds, loopDurationSeconds, expectedWrapAudioTime, pausedFrameFromClock, frameFromAudioClock,
} from "./loopPlaybackMath";
import {
  recordWrapObservation, summarizeWrapObservations, computeObservationDelayMs, computeVisualObservationLagMs,
  type LoopWrapObservation, type LoopWrapObservationSummary,
} from "./loopWrapDiagnostics";
import { shouldStopMediaElementBeforeWebAudioStart } from "./loopAuditionState";

export interface LoopAuditionCandidateRef {
  candidateId: string;
  startSeconds: number;
  endSeconds: number;
  // 0715F — required, not optional: the primary Web Audio path never
  // reconstructs boundaries from rounded seconds.
  startFrame: number;
  endFrame: number;
  sectionLabel?: string;
  label: string;
}

// 0715F §11 correction — an explicit request object, consolidating the
// previous 6-positional-argument `start()` call. `decodedBuffer`, when
// supplied, is used DIRECTLY (never re-decoded, never duplicated into the
// engine's own cache).
export interface LoopAuditionStartRequest {
  sourceTrackId: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceId: string;
  sourceKind: "track" | "stem";
  candidates: LoopAuditionCandidateRef[];
  startIndex: number;
  previewMode: LoopPreviewMode;
  decodedBuffer?: AudioBuffer;
}

export interface LoopAuditionController {
  session: LoopAuditionSession | null;
  loopIteration: number;
  // §6 — candidates for the CURRENT source, so Previous/Next can cycle
  // without the Sectional Looper page needing to be mounted.
  candidates: LoopAuditionCandidateRef[];
  activeCandidateIndex: number | null;

  start: (request: LoopAuditionStartRequest) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seekRelative: (relativeSeconds: number) => void;
  // 0716A — repositions the FROZEN paused frame without starting any audio
  // node or changing status; a no-op unless the session is already
  // "paused". Exists so a dragged playhead can be released silently and
  // then resumed (via the unchanged `resume()`) from the drop point.
  seekPausedTo: (absoluteSeconds: number) => void;

  // 0715F — dev-only diagnostics access (also exposed via window.MUSIC_DEBUG,
  // see App.tsx).
  getWrapObservationSummary: () => LoopWrapObservationSummary;
}

interface Options {
  // §9 — called before acquiring loop_audition authority, so the caller
  // can pause/duck standard and dual-deck playback exactly as
  // handleBeforeLoopPreview already did.
  onAcquire: () => void;
  onRelease: () => void;
}

interface DecodedCacheEntry {
  buffer: AudioBuffer;
  bytes: number;
}

// 0715F §12 correction — bounded by BOTH entry count and approximate
// decoded-byte size (a handful of long tracks can exceed a count-only cap).
const MAX_CACHE_ENTRIES = 8;
const MAX_CACHE_BYTES = 150 * 1024 * 1024;
// How far ahead of a predicted wrap the optional Boundary Fade schedules its
// gain automation, and how long the dip itself lasts.
const BOUNDARY_FADE_LOOKAHEAD_SECONDS = 0.05;
const BOUNDARY_FADE_MS = 8;
// React `session` display fields are throttled to this cadence; the actual
// audio-clock position lives in refs and is read every rAF tick regardless.
const DISPLAY_UPDATE_INTERVAL_MS = 80;

function estimateBufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4; // Float32 per sample per channel
}

export function useLoopAuditionController(opts: Options): LoopAuditionController {
  const [session, setSession] = useState<LoopAuditionSession | null>(null);
  const [loopIteration, setLoopIteration] = useState(0);
  const [candidates, setCandidates] = useState<LoopAuditionCandidateRef[]>([]);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number | null>(null);

  // Engine internals — refs only. Diagnostics/playhead position must never
  // force a React re-render on every rAF tick (0715F correction).
  const audioContextRef = useRef<AudioContext | null>(null);
  const bufferCacheRef = useRef<Map<string, DecodedCacheEntry>>(new Map());
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null); // explicit fallback only

  const generationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const candidatesListRef = useRef<LoopAuditionCandidateRef[]>([]);
  const requestRef = useRef<LoopAuditionStartRequest | null>(null);
  const sessionRef = useRef<LoopAuditionSession | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const startedAtAudioTimeRef = useRef(0);
  const loopStartFrameRef = useRef(0);
  const loopEndFrameRef = useRef(0);
  const sampleRateRef = useRef(44100);
  const pausedFrameRef = useRef<number | null>(null);
  const nextWrapIndexRef = useRef(1);
  const fadeScheduledForWrapRef = useRef(0);

  const wrapObservationsRef = useRef<LoopWrapObservation[]>([]);
  const perfAnchorRef = useRef<{ perfNow: number; audioTime: number } | null>(null);
  const lastDisplayUpdateRef = useRef(0);

  function ensureAudioContext(): AudioContext {
    if (!audioContextRef.current) {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      audioContextRef.current = new Ctor();
    }
    return audioContextRef.current;
  }

  function cacheGet(sourceId: string): AudioBuffer | undefined {
    return bufferCacheRef.current.get(sourceId)?.buffer;
  }

  // §12 — evicts oldest-first past either the entry-count or byte-size cap.
  function cachePut(sourceId: string, buffer: AudioBuffer) {
    const cache = bufferCacheRef.current;
    cache.delete(sourceId);
    cache.set(sourceId, { buffer, bytes: estimateBufferBytes(buffer) });
    let totalBytes = 0;
    for (const entry of cache.values()) totalBytes += entry.bytes;
    const keys = Array.from(cache.keys());
    let i = 0;
    while ((cache.size > MAX_CACHE_ENTRIES || totalBytes > MAX_CACHE_BYTES) && i < keys.length) {
      const evicted = cache.get(keys[i]);
      if (evicted) { totalBytes -= evicted.bytes; cache.delete(keys[i]); }
      i++;
    }
  }

  function teardownActiveNode() {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch { /* already stopped */ }
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
  }

  // §7/§10 — always a NEW node (Web Audio source nodes are single-use).
  // Boundary Fade (off by default) inserts a GainNode; the default path
  // connects the buffer source directly to destination (native hard loop,
  // no gain automation at all).
  function startSourceNode(
    ctx: AudioContext, buffer: AudioBuffer, loopStartFrame: number, loopEndFrame: number,
    offsetFrame: number, boundaryFadeEnabled: boolean,
  ): AudioBufferSourceNode {
    const sr = buffer.sampleRate;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    node.loopStart = frameToSeconds(loopStartFrame, sr);
    node.loopEnd = frameToSeconds(loopEndFrame, sr);
    if (boundaryFadeEnabled) {
      const gain = ctx.createGain();
      node.connect(gain);
      gain.connect(ctx.destination);
      gainNodeRef.current = gain;
    } else {
      node.connect(ctx.destination);
    }
    node.start(0, offsetFrame / sr);
    return node;
  }

  function anchorClockToFrame(audioNow: number, frame: number, loopStartFrame: number, sampleRate: number) {
    startedAtAudioTimeRef.current = audioNow - (frame - loopStartFrame) / sampleRate;
    perfAnchorRef.current = { perfNow: performance.now(), audioTime: audioNow };
    nextWrapIndexRef.current = 1;
    fadeScheduledForWrapRef.current = 0;
  }

  const stopInternal = useCallback((releaseAuthority: boolean) => {
    generationRef.current++;
    teardownActiveNode();
    currentBufferRef.current = null;
    if (htmlAudioRef.current) {
      htmlAudioRef.current.pause();
      htmlAudioRef.current.ontimeupdate = null;
    }
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    pausedFrameRef.current = null;
    wrapObservationsRef.current = [];
    if (releaseAuthority && sessionRef.current) opts.onRelease();
    setSession(null);
    setLoopIteration(0);
    setActiveCandidateIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => stopInternal(true), [stopInternal]);

  async function playCandidateMediaFallback(
    request: LoopAuditionStartRequest, cand: LoopAuditionCandidateRef, generation: number,
  ) {
    const audio = htmlAudioRef.current ?? new Audio();
    htmlAudioRef.current = audio;
    if (audio.src !== request.sourceUrl) audio.src = request.sourceUrl;
    audio.currentTime = cand.startSeconds;
    audio.volume = 1;
    audio.ontimeupdate = () => {
      if (audio.currentTime >= cand.endSeconds) {
        audio.currentTime = cand.startSeconds;
        setLoopIteration((n) => n + 1);
      }
    };
    try {
      await audio.play();
      if (generationRef.current !== generation) return;
      setSession((prev) => (prev ? {
        ...prev, status: "playing", timingAuthority: "media_element", errorCode: "MEDIA_FALLBACK_ACTIVE",
      } : prev));
    } catch {
      if (generationRef.current !== generation) return;
      setSession((prev) => (prev ? { ...prev, status: "error", errorCode: "SOURCE_UNAVAILABLE" } : prev));
    }
  }

  // §7-§9 — the sample-accurate Web Audio path. Falls back to
  // playCandidateMediaFallback only on genuine decode/context failure.
  const playCandidate = useCallback(async (index: number) => {
    const request = requestRef.current;
    const cand = candidatesListRef.current[index];
    if (!request || !cand) return;

    if (!(cand.endFrame > cand.startFrame)) {
      setSession((prev) => (prev ? { ...prev, status: "error", errorCode: "INVALID_LOOP_RANGE" } : prev));
      return;
    }

    generationRef.current++;
    const generation = generationRef.current;
    setActiveCandidateIndex(index);
    setLoopIteration(0);

    setSession((prev) => (prev ? {
      ...prev,
      candidateId: cand.candidateId,
      sectionLabel: cand.sectionLabel,
      startSeconds: cand.startSeconds,
      endSeconds: cand.endSeconds,
      startFrame: cand.startFrame,
      endFrame: cand.endFrame,
      status: "loading",
    } : prev));

    try {
      const ctx = ensureAudioContext();
      // 0715F required correction — resume BEFORE any async decode work,
      // synchronously from the user-gesture call stack.
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          if (generationRef.current !== generation) return;
          setSession((prev) => (prev ? { ...prev, status: "error", errorCode: "AUDIO_CONTEXT_SUSPENDED" } : prev));
          return;
        }
      }
      if (generationRef.current !== generation) return;

      let buffer = request.decodedBuffer ?? cacheGet(request.sourceId);
      if (!buffer) {
        const resp = await fetch(request.sourceUrl);
        const arrayBuf = await resp.arrayBuffer();
        if (generationRef.current !== generation) return;
        buffer = await ctx.decodeAudioData(arrayBuf);
        if (generationRef.current !== generation) return;
        cachePut(request.sourceId, buffer);
      }
      // When request.decodedBuffer was supplied directly, it is used as-is
      // and never also inserted into bufferCacheRef (no duplicate copy).

      const sampleRate = buffer.sampleRate;
      sampleRateRef.current = sampleRate;
      loopStartFrameRef.current = cand.startFrame;
      loopEndFrameRef.current = cand.endFrame;

      teardownActiveNode();
      const boundaryFadeEnabled = request.previewMode === "boundary_fade";
      const node = startSourceNode(ctx, buffer, cand.startFrame, cand.endFrame, cand.startFrame, boundaryFadeEnabled);
      sourceNodeRef.current = node;
      currentBufferRef.current = buffer;
      anchorClockToFrame(ctx.currentTime, cand.startFrame, cand.startFrame, sampleRate);

      setSession((prev) => (prev ? {
        ...prev, status: "playing", timingAuthority: "web_audio", sampleRate, errorCode: undefined,
      } : prev));
    } catch {
      if (generationRef.current !== generation) return;
      await playCandidateMediaFallback(request, cand, generation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async (request: LoopAuditionStartRequest) => {
    opts.onAcquire();
    // §17 — stop a media-element fallback session before starting Web Audio
    // for the same audition.
    if (shouldStopMediaElementBeforeWebAudioStart(sessionRef.current)) {
      stopInternal(false);
    }
    requestRef.current = request;
    candidatesListRef.current = request.candidates;
    setCandidates(request.candidates);
    const cand = request.candidates[request.startIndex];
    if (!cand) return;
    setSession({
      authority: "loop_audition",
      sourceTrackId: request.sourceTrackId, sourceStemId: request.sourceKind === "stem" ? request.sourceId : undefined,
      sourceTitle: request.sourceTitle,
      candidateId: cand.candidateId, sectionLabel: cand.sectionLabel,
      startSeconds: cand.startSeconds, endSeconds: cand.endSeconds,
      startFrame: cand.startFrame, endFrame: cand.endFrame,
      currentAbsoluteSeconds: cand.startSeconds, currentRelativeSeconds: 0,
      loopIteration: 0, status: "loading", previewMode: request.previewMode,
      timingAuthority: "web_audio", sampleRate: sampleRateRef.current,
    });
    await playCandidate(request.startIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playCandidate, stopInternal]);

  const pause = useCallback(() => {
    const cur = sessionRef.current;
    if (!cur) return;
    if (cur.timingAuthority === "web_audio") {
      const ctx = audioContextRef.current;
      if (!ctx) return;
      const frame = pausedFrameFromClock(
        ctx.currentTime, startedAtAudioTimeRef.current, loopStartFrameRef.current, loopEndFrameRef.current, sampleRateRef.current,
      );
      pausedFrameRef.current = frame;
      teardownActiveNode();
    } else {
      htmlAudioRef.current?.pause();
    }
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setSession((prev) => (prev ? { ...prev, status: "paused" } : prev));
  }, []);

  const resume = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur) return;
    if (cur.timingAuthority === "web_audio") {
      const ctx = audioContextRef.current;
      const buffer = currentBufferRef.current;
      const pausedFrame = pausedFrameRef.current;
      if (!ctx || !buffer || pausedFrame == null) return;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          setSession((prev) => (prev ? { ...prev, status: "error", errorCode: "AUDIO_CONTEXT_SUSPENDED" } : prev));
          return;
        }
      }
      // §10 Resume — per loopAuditionState.describeResumeAction's tested
      // contract, this is ALWAYS a brand-new AudioBufferSourceNode (Web
      // Audio source nodes are single-use); startSourceNode below always
      // constructs one via ctx.createBufferSource(), never reuses the old ref.
      const boundaryFadeEnabled = cur.previewMode === "boundary_fade";
      const node = startSourceNode(
        ctx, buffer, loopStartFrameRef.current, loopEndFrameRef.current, pausedFrame, boundaryFadeEnabled,
      );
      sourceNodeRef.current = node;
      anchorClockToFrame(ctx.currentTime, pausedFrame, loopStartFrameRef.current, sampleRateRef.current);
      pausedFrameRef.current = null;
      setSession((prev) => (prev ? { ...prev, status: "playing" } : prev));
    } else {
      try {
        await htmlAudioRef.current?.play();
        setSession((prev) => (prev ? { ...prev, status: "playing" } : prev));
      } catch {
        setSession((prev) => (prev ? { ...prev, status: "error", errorCode: "SOURCE_UNAVAILABLE" } : prev));
      }
    }
  }, []);

  const next = useCallback(() => {
    const idx = activeCandidateIndex;
    if (idx == null || candidates.length === 0) return;
    void playCandidate((idx + 1) % candidates.length);
  }, [activeCandidateIndex, candidates.length, playCandidate]);

  const previous = useCallback(() => {
    const idx = activeCandidateIndex;
    if (idx == null || candidates.length === 0) return;
    void playCandidate((idx - 1 + candidates.length) % candidates.length);
  }, [activeCandidateIndex, candidates.length, playCandidate]);

  const seekRelative = useCallback((relativeSeconds: number) => {
    const cur = sessionRef.current;
    if (!cur) return;
    const sr = sampleRateRef.current;
    const loopStart = loopStartFrameRef.current;
    const loopEnd = loopEndFrameRef.current;
    const targetSeconds = Math.max(cur.startSeconds, Math.min(cur.endSeconds, cur.startSeconds + relativeSeconds));
    const targetFrame = Math.round(targetSeconds * sr);
    if (cur.timingAuthority === "web_audio") {
      const ctx = audioContextRef.current;
      const buffer = currentBufferRef.current;
      if (!ctx || !buffer) return;
      teardownActiveNode();
      const node = startSourceNode(ctx, buffer, loopStart, loopEnd, targetFrame, cur.previewMode === "boundary_fade");
      sourceNodeRef.current = node;
      anchorClockToFrame(ctx.currentTime, targetFrame, loopStart, sr);
    } else if (htmlAudioRef.current) {
      htmlAudioRef.current.currentTime = targetSeconds;
    }
  }, []);

  // 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead — the one minimal
  // addition this build makes to the engine. Unlike seekRelative (which
  // always audibly starts a new source node regardless of status), this
  // ONLY updates the frozen paused position and the displayed session
  // fields while status is already "paused" — it never creates an
  // AudioBufferSourceNode and never changes status. resume() is completely
  // unchanged and will pick up this new position from pausedFrameRef
  // exactly as it already does today.
  const seekPausedTo = useCallback((absoluteSeconds: number) => {
    const cur = sessionRef.current;
    if (!cur || cur.status !== "paused") return;
    const sr = sampleRateRef.current;
    const clampedSeconds = Math.max(cur.startSeconds, Math.min(cur.endSeconds, absoluteSeconds));
    if (cur.timingAuthority === "web_audio") {
      pausedFrameRef.current = Math.round(clampedSeconds * sr);
    } else if (htmlAudioRef.current) {
      htmlAudioRef.current.currentTime = clampedSeconds;
    }
    setSession((prev) => (prev ? {
      ...prev,
      currentAbsoluteSeconds: clampedSeconds,
      currentRelativeSeconds: clampedSeconds - cur.startSeconds,
    } : prev));
  }, []);

  function maybeScheduleBoundaryFade(ctx: AudioContext, gain: GainNode, loopDurSec: number) {
    const now = ctx.currentTime;
    const nextWrapAudioTime = startedAtAudioTimeRef.current + loopDurSec * nextWrapIndexRef.current;
    if (nextWrapAudioTime - now <= BOUNDARY_FADE_LOOKAHEAD_SECONDS && fadeScheduledForWrapRef.current !== nextWrapIndexRef.current) {
      const fadeSec = BOUNDARY_FADE_MS / 1000;
      const fadeStart = Math.max(now, nextWrapAudioTime - fadeSec);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(1, fadeStart);
      gain.gain.linearRampToValueAtTime(0, nextWrapAudioTime);
      gain.gain.setValueAtTime(0, nextWrapAudioTime);
      gain.gain.linearRampToValueAtTime(1, nextWrapAudioTime + fadeSec);
      fadeScheduledForWrapRef.current = nextWrapIndexRef.current;
    }
  }

  // §9 — single rAF loop; audio-clock-derived frame position for Web Audio
  // sessions, the (coarser, disclosed) media-element clock for fallback
  // sessions. React `session` display fields update at a throttled cadence,
  // never on every tick (0715F correction) — diagnostics live in refs.
  useEffect(() => {
    if (session?.status !== "playing") {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const isWebAudio = session.timingAuthority === "web_audio";
    const ctx = audioContextRef.current;

    function tick() {
      if (isWebAudio && ctx) {
        const audioNow = ctx.currentTime;
        const loopStart = loopStartFrameRef.current;
        const loopEnd = loopEndFrameRef.current;
        const sr = sampleRateRef.current;
        const loopDurSec = loopDurationSeconds(loopStart, loopEnd, sr);
        const expected = expectedWrapAudioTime(startedAtAudioTimeRef.current, loopDurSec, nextWrapIndexRef.current);

        if (gainNodeRef.current) maybeScheduleBoundaryFade(ctx, gainNodeRef.current, loopDurSec);

        const observedFrame = frameFromAudioClock(audioNow, startedAtAudioTimeRef.current, loopStart, loopEnd, sr);

        if (audioNow >= expected) {
          if (import.meta.env?.DEV) {
            const anchor = perfAnchorRef.current;
            const nowPerf = performance.now();
            const expectedPerf = anchor ? anchor.perfNow + (expected - anchor.audioTime) * 1000 : nowPerf;
            const entry: LoopWrapObservation = {
              expectedWrapAudioTime: expected,
              observedAtAudioTime: audioNow,
              observationDelayMs: computeObservationDelayMs(expected, audioNow),
              visualFrameAtObservation: observedFrame,
              visualObservationLagMs: computeVisualObservationLagMs(expectedPerf, nowPerf),
            };
            wrapObservationsRef.current = recordWrapObservation(wrapObservationsRef.current, entry);
          }
          setLoopIteration((n) => n + 1);
          nextWrapIndexRef.current += 1;
        }

        const nowPerfForDisplay = performance.now();
        if (nowPerfForDisplay - lastDisplayUpdateRef.current > DISPLAY_UPDATE_INTERVAL_MS) {
          lastDisplayUpdateRef.current = nowPerfForDisplay;
          setSession((prev) => (prev ? {
            ...prev,
            currentAbsoluteSeconds: frameToSeconds(observedFrame, sr),
            currentRelativeSeconds: frameToSeconds(observedFrame - loopStart, sr),
          } : prev));
        }
      } else {
        const audio = htmlAudioRef.current;
        const nowPerfForDisplay = performance.now();
        if (audio && nowPerfForDisplay - lastDisplayUpdateRef.current > DISPLAY_UPDATE_INTERVAL_MS) {
          lastDisplayUpdateRef.current = nowPerfForDisplay;
          setSession((prev) => (prev ? {
            ...prev,
            currentAbsoluteSeconds: audio.currentTime,
            currentRelativeSeconds: Math.max(0, audio.currentTime - prev.startSeconds),
          } : prev));
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); rafRef.current = null; };
  }, [session?.status, session?.timingAuthority]);

  // §18 — on app unload, stop safely and release audio nodes/context.
  useEffect(() => {
    function handleUnload() {
      teardownActiveNode();
      if (htmlAudioRef.current) htmlAudioRef.current.pause();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      void audioContextRef.current?.close();
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  const getWrapObservationSummary = useCallback(() => summarizeWrapObservations(wrapObservationsRef.current), []);

  return {
    session, loopIteration, candidates, activeCandidateIndex,
    start, pause, resume, stop, next, previous, seekRelative, seekPausedTo,
    getWrapObservationSummary,
  };
}
