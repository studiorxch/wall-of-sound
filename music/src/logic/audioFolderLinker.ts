import type { Track } from "../data/trackTypes";
import { inferAudioRelPath, type AudioCategory } from "./audioPathResolver";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isAudioFile(name: string): boolean {
  return /\.(mp3|flac|wav|aif|aiff|ogg|m4a|aac|opus)$/i.test(name);
}

export interface AudioLinkResult {
  linkedCount: number;
  missingCount: number;       // tracks in source that found no file
  alreadyLinked: number;      // tracks that were already linked (preserved, not rescanned)
  duplicateFileMatches: number; // files matched by >1 track
  unmatchedFiles: number;     // audio files that matched no catalog row
  playableCount: number;      // tracks with a live objectUrl created this session
}

export interface AudioLinkReport extends AudioLinkResult {
  sourceOwner: string;
  scannedAt: string;
  folderName: string;
  totalSourceTracks: number;
  totalAudioFiles: number;
}

/**
 * Match audio files from a folder picker against library tracks.
 *
 * Matching order (first match wins):
 *   1. audioFilename exact (case-insensitive)
 *   2. fileName exact (case-insensitive)
 *   3. sunoId contained in filename
 *   4. normalized title exact match
 *   5. normalized title contained in normalized filename
 *
 * Sets filePath to webkitRelativePath (or name fallback) so the browser
 * has a stable relative reference even without filesystem access.
 * audioLinked=true means matched; audioMissing=true means scanned+unmatched.
 */
export function linkAudioFiles(
  tracks: Track[],
  files: File[],
  sourceOwnerFilter?: string,
  options?: { rescan?: boolean; revokeUrls?: string[] },
): { tracks: Track[]; report: AudioLinkReport; objectUrls: Map<string, string> } {
  const audioFiles = files.filter((f) => isAudioFile(f.name));
  const now = new Date().toISOString();
  const folderName = inferFolderName(audioFiles);
  const rescan = options?.rescan ?? false;

  // Revoke stale objectUrls before creating new ones
  for (const url of (options?.revokeUrls ?? [])) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }

  // Build lookup maps from filename → (relative path, File)
  const byExact = new Map<string, { rel: string; file: File }>();  // "filename.ext" (lowercase) → {rel, file}
  const byNoExt = new Map<string, { rel: string; file: File }>();  // normalize(name-no-ext) → {rel, file}
  // Track which file paths get claimed (for duplicate detection)
  const fileClaims = new Map<string, number>(); // relativePath → claim count

  for (const f of audioFiles) {
    const rel = (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const lower = f.name.toLowerCase();
    byExact.set(lower, { rel, file: f });
    const noExt = lower.replace(/\.[^.]+$/, "");
    byNoExt.set(normalize(noExt), { rel, file: f });
    fileClaims.set(rel, 0);
  }

  const report: AudioLinkReport = {
    sourceOwner: sourceOwnerFilter ?? "all",
    scannedAt: now,
    folderName,
    totalSourceTracks: 0,
    totalAudioFiles: audioFiles.length,
    linkedCount: 0,
    missingCount: 0,
    alreadyLinked: 0,
    duplicateFileMatches: 0,
    unmatchedFiles: 0,
    playableCount: 0,
  };

  const objectUrls = new Map<string, string>(); // trackId → objectUrl

  const updated = tracks.map((t): Track => {
    if (sourceOwnerFilter && t.sourceOwner !== sourceOwnerFilter) return t;
    report.totalSourceTracks++;

    // Already linked + not a rescan: preserve (but try to create objectUrl if File is available)
    if (!rescan && t.audioLinked && t.filePath) {
      report.alreadyLinked++;
      if (fileClaims.has(t.filePath)) {
        fileClaims.set(t.filePath, (fileClaims.get(t.filePath) ?? 0) + 1);
      }
      return t;
    }

    let matchRel: string | undefined;
    let matchFile: File | undefined;

    // 1. audioFilename exact
    if (!matchRel && t.audioFilename) {
      const m = byExact.get(t.audioFilename.toLowerCase());
      if (m) { matchRel = m.rel; matchFile = m.file; }
    }
    // 2. fileName exact
    if (!matchRel && t.fileName) {
      const m = byExact.get(t.fileName.toLowerCase());
      if (m) { matchRel = m.rel; matchFile = m.file; }
    }
    // 3. sunoId substring in filename
    if (!matchRel && t.sunoId) {
      const sid = t.sunoId.toLowerCase();
      for (const [name, entry] of byExact) {
        if (name.includes(sid)) { matchRel = entry.rel; matchFile = entry.file; break; }
      }
    }
    // 4. normalized title exact
    if (!matchRel && t.title) {
      const nt = normalize(t.title);
      if (nt.length > 1) {
        const m = byNoExt.get(nt);
        if (m) { matchRel = m.rel; matchFile = m.file; }
      }
    }
    // 5. normalized title contained in normalized filename
    if (!matchRel && t.title) {
      const nt = normalize(t.title);
      if (nt.length > 3) {
        for (const [normName, entry] of byNoExt) {
          if (normName.includes(nt)) { matchRel = entry.rel; matchFile = entry.file; break; }
        }
      }
    }

    if (matchRel && matchFile) {
      report.linkedCount++;
      const prev = fileClaims.get(matchRel) ?? 0;
      fileClaims.set(matchRel, prev + 1);
      if (prev > 0) report.duplicateFileMatches++;
      const objUrl = URL.createObjectURL(matchFile);
      objectUrls.set(t.trackId, objUrl);
      report.playableCount++;
      // Derive portable audioRelPath — prefer existing audioFileName, fallback to matched file name
      const linkedFileName = t.audioFilename ?? t.fileName ?? matchFile.name;
      const cat: AudioCategory =
        t.sourceOwner === "reference" ? "reference" :
        t.sourceOwner === "external" ? "external" : "catalog";
      const audioRelPath = t.audioRelPath ?? inferAudioRelPath(cat, linkedFileName);
      return {
        ...t,
        filePath: matchRel,
        audioLinked: true,
        audioMissing: false,
        audioLastScannedAt: now,
        objectUrl: objUrl,
        audioFileName: linkedFileName,
        audioRelPath,
        audioCategory: cat,
        audioStatus: "linked" as const,
      };
    }

    report.missingCount++;
    return { ...t, audioLinked: false, audioMissing: true, audioLastScannedAt: now, objectUrl: undefined };
  });

  // Count audio files that were never claimed by any track
  for (const count of fileClaims.values()) {
    if (count === 0) report.unmatchedFiles++;
  }

  return { tracks: updated, report, objectUrls };
}

function inferFolderName(files: File[]): string {
  for (const f of files) {
    const rel = (f as unknown as { webkitRelativePath?: string }).webkitRelativePath;
    if (rel) {
      const parts = rel.split("/");
      if (parts.length > 1) return parts[0];
    }
  }
  return files[0]?.name ?? "unknown folder";
}
