// 0722C_MUSIC_Production_Stem_Export — thin re-export of the existing,
// already-proven radio fs primitives. Node-only. No duplication: every
// function here is imported straight from server/radio/radioFsUtils.ts.

export {
  isPathConfinedTo,
  readJsonSafe,
  writeJsonAtomic,
  ensureDir,
  moveDir,
  moveFile,
  removeDirIfExists,
  listSubdirNames,
} from "../radio/radioFsUtils";

import path from "node:path";

// Sanitizes a track id for use as a filesystem directory segment — mirrors
// the same `[^a-zA-Z0-9_-]` pattern vite.config.ts already uses elsewhere
// for path-safety, so archive directory names never depend on arbitrary
// track-id characters.
export function safeStemDirName(trackId: string): string {
  return trackId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function trackStemLibraryRoot(libraryRoot: string): string {
  return path.join(libraryRoot, "TrackStemLibrary");
}

export function trackStemSetsDir(stemLibraryRoot: string, safeTrackId: string): string {
  return path.join(stemLibraryRoot, safeTrackId, "sets");
}

// Some real Library tracks (legacy External imports, confirmed live) carry
// an ABSOLUTE filePath rather than a LIBRARY_ROOT-relative audioRelPath —
// the same dual-shape audioAnalysisInput.ts's resolveAudioUrl already
// handles for playback. Every stem route resolves a source through this
// one function so both shapes are accepted identically, always still
// confined via isPathConfinedTo by the caller afterward.
export function resolveTrackSourcePath(musicLibraryRoot: string, audioRelPathOrAbsolute: string): string {
  return path.isAbsolute(audioRelPathOrAbsolute) ? audioRelPathOrAbsolute : path.resolve(musicLibraryRoot, audioRelPathOrAbsolute);
}
