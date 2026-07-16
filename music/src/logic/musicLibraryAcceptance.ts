// Persisted library-state acceptance (0712_MUSIC_Recovery_Screen_Removal).
//
// Once a valid state has been loaded, its fingerprint is recorded here so
// startup never re-litigates "is this state okay" on the next reload, dev
// restart, or rebuild — only genuine structural invalidity (unparseable,
// failed migration, missing root data) triggers a recovery prompt again.
// This deliberately does NOT compare entity counts against any other
// snapshot — count deltas (fewer playlists after an intentional delete,
// etc.) are not evidence of corruption.

import type { PlayProject } from "../data/playProjectTypes";

export interface AcceptedLibraryState {
  stateFingerprint: string;
  acceptedAt: string;
  schemaVersion: string;
}

const ACCEPTED_STATE_KEY = "music:acceptedLibraryState";

/**
 * Deterministic content hash (FNV-1a, 32-bit) over the state's own JSON
 * representation — stable across reloads/restarts for identical content,
 * changes whenever the actual persisted content changes. Not derived from
 * entity counts (spec §3): two states with the same counts but different
 * tracks/playlists hash differently, and the same state always hashes the
 * same regardless of how it's re-loaded.
 */
export function computeStateFingerprint(state: PlayProject): string {
  const json = JSON.stringify(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function loadAcceptedLibraryState(): AcceptedLibraryState | null {
  try {
    const raw = localStorage.getItem(ACCEPTED_STATE_KEY);
    return raw ? (JSON.parse(raw) as AcceptedLibraryState) : null;
  } catch {
    return null;
  }
}

export function saveAcceptedLibraryState(state: PlayProject): AcceptedLibraryState {
  const record: AcceptedLibraryState = {
    stateFingerprint: computeStateFingerprint(state),
    acceptedAt: new Date().toISOString(),
    schemaVersion: state.schemaVersion ?? "unknown",
  };
  try {
    localStorage.setItem(ACCEPTED_STATE_KEY, JSON.stringify(record));
  } catch {
    /* non-fatal — worst case, acceptance isn't remembered this session */
  }
  return record;
}

export function isStateAccepted(state: PlayProject): boolean {
  const accepted = loadAcceptedLibraryState();
  if (!accepted) return false;
  return accepted.stateFingerprint === computeStateFingerprint(state);
}
