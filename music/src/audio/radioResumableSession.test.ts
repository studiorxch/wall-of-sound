import { describe, expect, it } from "vitest";
import {
  RADIO_RESUMABLE_SESSION_STORAGE_KEY,
  clearRadioResumableSession,
  readRadioResumableSession,
  resolveResumedOffsetSeconds,
  writeRadioResumableSession,
  type RadioResumableSession,
} from "./radioResumableSession";

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

const SESSION: RadioResumableSession = {
  schemaVersion: 1,
  manifestBaseUrl: "/radio-web-export/soft-motion-radio/v1/",
  trackId: "track-2",
  trackIndex: 1,
  offsetSeconds: 30,
  referenceAtMs: 1_000_000,
  isPlaying: true,
  volume: 1,
  playbackMode: "personal",
};

describe("radioResumableSession round-trip", () => {
  it("writes and reads back an identical session", () => {
    const storage = fakeStorage();
    writeRadioResumableSession(storage, SESSION);
    expect(readRadioResumableSession(storage)).toEqual(SESSION);
  });

  it("returns null when nothing is stored", () => {
    expect(readRadioResumableSession(fakeStorage())).toBeNull();
  });

  it("clears the stored session", () => {
    const storage = fakeStorage();
    writeRadioResumableSession(storage, SESSION);
    clearRadioResumableSession(storage);
    expect(readRadioResumableSession(storage)).toBeNull();
  });

  it("uses the documented storage key", () => {
    const storage = fakeStorage();
    writeRadioResumableSession(storage, SESSION);
    expect(storage.getItem(RADIO_RESUMABLE_SESSION_STORAGE_KEY)).not.toBeNull();
  });
});

describe("radioResumableSession malformed input", () => {
  it("rejects non-JSON", () => {
    expect(readRadioResumableSession(fakeStorage({ [RADIO_RESUMABLE_SESSION_STORAGE_KEY]: "not json" }))).toBeNull();
  });

  it("rejects a wrong schema version", () => {
    const raw = JSON.stringify({ ...SESSION, schemaVersion: 2 });
    expect(readRadioResumableSession(fakeStorage({ [RADIO_RESUMABLE_SESSION_STORAGE_KEY]: raw }))).toBeNull();
  });

  it("rejects a missing required field", () => {
    const { trackId, ...rest } = SESSION;
    void trackId;
    const raw = JSON.stringify(rest);
    expect(readRadioResumableSession(fakeStorage({ [RADIO_RESUMABLE_SESSION_STORAGE_KEY]: raw }))).toBeNull();
  });

  it("rejects an invalid playbackMode", () => {
    const raw = JSON.stringify({ ...SESSION, playbackMode: "warp-speed" });
    expect(readRadioResumableSession(fakeStorage({ [RADIO_RESUMABLE_SESSION_STORAGE_KEY]: raw }))).toBeNull();
  });

  it("rejects a non-finite number field", () => {
    const raw = JSON.stringify({ ...SESSION, offsetSeconds: Number.NaN });
    expect(readRadioResumableSession(fakeStorage({ [RADIO_RESUMABLE_SESSION_STORAGE_KEY]: raw }))).toBeNull();
  });
});

describe("resolveResumedOffsetSeconds", () => {
  it("extrapolates forward by elapsed time while playing", () => {
    const result = resolveResumedOffsetSeconds(SESSION, SESSION.referenceAtMs + 15_000);
    expect(result).toBeCloseTo(45, 5);
  });

  it("returns the saved offset unchanged while paused", () => {
    const paused = { ...SESSION, isPlaying: false };
    const result = resolveResumedOffsetSeconds(paused, paused.referenceAtMs + 15_000);
    expect(result).toBe(30);
  });

  it("never returns a value earlier than the saved offset (clock skew safety)", () => {
    const result = resolveResumedOffsetSeconds(SESSION, SESSION.referenceAtMs - 5_000);
    expect(result).toBe(30);
  });
});
