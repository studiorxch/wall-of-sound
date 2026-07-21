// RadioLoop Library Workspace (0717A) — a fully independent Opus audition
// engine (decision 7). Correction: this hook must NEVER call
// handleBeforeLoopPreview or any other MUSIC-transport chokepoint — that
// function actively pauses the standard <audio> element and the dual-deck
// engine, which is exactly the "acquiring or stopping MUSIC transport"
// spec §8.4 forbids. It owns its own AudioContext/gain/cache/lifecycle in
// total isolation: no import from src/audio/, no import of App.tsx's
// playback state, no reach into useLoopAuditionController's refs.
// "Starting a new audition stops the previous" refers only to this hook's
// OWN prior RadioLoop audition — if the user simultaneously plays the main
// transport, the dual-deck engine, or a sectional-looper candidate,
// RadioLoop audition plays independently; neither stops the other. This is
// a deliberate, accepted simplicity tradeoff for this build, not an
// oversight (see radioLoopAudition.isolation.test.ts, which asserts this
// file's own source never references any of those forbidden symbols).
//
// The AudioContext orchestration itself is not unit-tested — no jsdom/Web-
// Audio environment exists in this project's vitest config, the same
// documented gap useLoopAuditionController.ts and loopRenderService.ts
// already have. Every PURE step it composes (estimateBufferBytes,
// selectCacheEvictions) IS unit-tested in radioLoopAudition.test.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RadioLoopAuditionPhase, RadioLoopAuditionState } from "../../data/radioWorkspaceTypes";
import type { RadioLoopId, RadioPackageVersion } from "../../data/radioLoopTypes";

const MAX_CACHE_ENTRIES = 16;
const MAX_CACHE_BYTES = 32 * 1024 * 1024; // 32MB — generous for 128kbps Opus cores, tens of KB each decoded.

// Pure — 4 bytes per Float32 sample, per channel.
export function estimateBufferBytes(numberOfFrames: number, numberOfChannels: number): number {
  return numberOfFrames * numberOfChannels * 4;
}

export interface CacheEntrySize {
  key: string;
  approxBytes: number;
}

// Pure — given cache entries in insertion (oldest-first) order, returns the
// keys to evict so the cache satisfies both the entry-count and byte caps.
// Oldest-first eviction until both caps are satisfied.
export function selectCacheEvictions(entriesOldestFirst: CacheEntrySize[], maxEntries: number, maxBytes: number): string[] {
  const evicted: string[] = [];
  const remaining = [...entriesOldestFirst];
  let totalBytes = remaining.reduce((sum, e) => sum + e.approxBytes, 0);

  while (remaining.length > 0 && (remaining.length > maxEntries || totalBytes > maxBytes)) {
    const oldest = remaining.shift();
    if (!oldest) break;
    evicted.push(oldest.key);
    totalBytes -= oldest.approxBytes;
  }
  return evicted;
}

export interface UseRadioLoopAuditionResult {
  state: RadioLoopAuditionState;
  volume: number;
  play: (radioLoopId: RadioLoopId, packageVersion: RadioPackageVersion) => Promise<void>;
  stop: () => void;
  setVolume: (volume: number) => void;
}

interface CacheEntry {
  buffer: AudioBuffer;
  approxBytes: number;
}

function cacheKeyFor(radioLoopId: RadioLoopId, packageVersion: RadioPackageVersion): string {
  return `${radioLoopId}:v${packageVersion}`;
}

export function useRadioLoopAudition(): UseRadioLoopAuditionResult {
  const [state, setState] = useState<RadioLoopAuditionState>({ radioLoopId: null, packageVersion: null, phase: "idle" });
  const [volume, setVolumeState] = useState(1);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const generationRef = useRef(0);
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const cacheOrderRef = useRef<string[]>([]);

  function ensureAudioContext(): AudioContext {
    if (!audioContextRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AC();
    }
    return audioContextRef.current;
  }

  function stopSourceNode() {
    generationRef.current += 1;
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch { /* already stopped */ }
      try { sourceNodeRef.current.disconnect(); } catch { /* already disconnected */ }
      sourceNodeRef.current = null;
    }
  }

  function cachePut(key: string, entry: CacheEntry) {
    cacheRef.current.set(key, entry);
    cacheOrderRef.current = cacheOrderRef.current.filter((k) => k !== key);
    cacheOrderRef.current.push(key);
    const sizes: CacheEntrySize[] = cacheOrderRef.current.map((k) => ({ key: k, approxBytes: cacheRef.current.get(k)?.approxBytes ?? 0 }));
    for (const evictKey of selectCacheEvictions(sizes, MAX_CACHE_ENTRIES, MAX_CACHE_BYTES)) {
      cacheRef.current.delete(evictKey);
      cacheOrderRef.current = cacheOrderRef.current.filter((k) => k !== evictKey);
    }
  }

  const stop = useCallback(() => {
    stopSourceNode();
    setState({ radioLoopId: null, packageVersion: null, phase: "idle" });
  }, []);

  const setVolume = useCallback((next: number) => {
    setVolumeState(next);
    if (gainNodeRef.current) gainNodeRef.current.gain.value = next;
  }, []);

  const play = useCallback(async (radioLoopId: RadioLoopId, packageVersion: RadioPackageVersion) => {
    stopSourceNode(); // only this hook's own previous audition
    const generation = generationRef.current;
    setState({ radioLoopId, packageVersion, phase: "loading" as RadioLoopAuditionPhase });

    try {
      const ctx = ensureAudioContext();
      await ctx.resume();

      const cacheKey = cacheKeyFor(radioLoopId, packageVersion);
      let buffer = cacheRef.current.get(cacheKey)?.buffer;
      if (!buffer) {
        const resp = await fetch(`/radio-package-asset?radioLoopId=${encodeURIComponent(radioLoopId)}&packageVersion=${packageVersion}&asset=core`);
        if (!resp.ok) throw new Error(`asset_fetch_failed:${resp.status}`);
        const arrayBuffer = await resp.arrayBuffer();
        buffer = await ctx.decodeAudioData(arrayBuffer);
        cachePut(cacheKey, { buffer, approxBytes: estimateBufferBytes(buffer.length, buffer.numberOfChannels) });
      }

      if (generationRef.current !== generation) return; // superseded by a newer play()/stop()

      if (!gainNodeRef.current) {
        gainNodeRef.current = ctx.createGain();
        gainNodeRef.current.connect(ctx.destination);
      }
      gainNodeRef.current.gain.value = volume;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gainNodeRef.current);
      source.start();
      sourceNodeRef.current = source;

      if (generationRef.current !== generation) {
        try { source.stop(); } catch { /* ignore */ }
        try { source.disconnect(); } catch { /* ignore */ }
        return;
      }
      setState({ radioLoopId, packageVersion, phase: "playing" });
    } catch (err) {
      if (generationRef.current !== generation) return;
      const message = err instanceof Error ? err.message : "audition_failed";
      setState({ radioLoopId, packageVersion, phase: "error", error: message });
    }
  }, [volume]);

  // Stop and disconnect on unmount (leaving the workspace) — never leaves
  // an audio node dangling.
  useEffect(() => {
    return () => {
      stopSourceNode();
      audioContextRef.current?.close().catch(() => { /* ignore */ });
    };
  }, []);

  return { state, volume, play, stop, setVolume };
}
