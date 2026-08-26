// MUSIC P0 Clean Library Foundation — Step B: duplicate/version/format
// reconciliation (0813_MUSIC_P0_Clean_Library_Foundation_StepB).
//
// Pure — no fetch, no filesystem, no React. Classifies one newly-seen
// physical file against the existing library into exactly one of four
// identity classes:
//
//   exact_asset_duplicate           — byte-identical to an asset we already have
//   same_recording_different_format — same recording, different container (WAV/FLAC/MP3)
//   related_version                 — plausibly related (edit/master/alt render), not certain
//   distinct_recording              — no meaningful evidence of any relation
//
// Checksum equality is used ONLY for the exact-duplicate class. WAV, FLAC,
// and MP3 encodings of the same underlying recording normally hash
// differently from each other — cross-format identity is established
// through weaker, explicitly-labeled evidence (normalized title/artist +
// duration-within-tolerance) instead, never by checksum, and every
// classification carries its evidence and a confidence tier so the caller
// can decide how much to trust it. Nothing in this module ever merges
// anything on its own — see attachAssetToTrack, which callers invoke only
// after an explicit human decision.

import type { Track } from "../data/trackTypes";
import type {
  AssetReconciliationClass,
  AssetReconciliationEvidence,
  AssetReconciliationResult,
  SunoCanonicalEvidenceMatch,
  TrackAsset,
  TrackAssetFormat,
} from "../data/trackAssetTypes";

const DURATION_TOLERANCE_SECONDS = 2;
const VERSION_HINT_WORDS = "edit|extended|radio|instrumental|acapella|remix|master|mix|alt(?:ernate)?|v2|version|demo|rough";
const VERSION_HINT_PATTERN = new RegExp(`\\b(${VERSION_HINT_WORDS})\\b`, "i");

export function normalizeForCompare(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

const EXTENSION_TO_FORMAT: Record<string, TrackAssetFormat> = {
  wav: "wav", flac: "flac", aiff: "aiff", aif: "aiff",
  mp3: "mp3", m4a: "m4a", aac: "aac", ogg: "ogg", opus: "opus",
};

export function formatFromExtension(fileNameOrExt: string): TrackAssetFormat {
  const ext = fileNameOrExt.replace(/^.*\./, "").toLowerCase();
  return EXTENSION_TO_FORMAT[ext] ?? "other";
}

// ---------------------------------------------------------------------------
// Legacy-data bridge — every track imported before `assets` existed is still
// queryable through the same functions, via a synthesized single-entry view
// built from its existing single-file fields. Never persisted itself; pure
// derivation, recomputed on every call.
// ---------------------------------------------------------------------------

export function buildPrimaryAssetFromTrack(track: Track): TrackAsset | null {
  const fileName = track.audioFileName ?? (track.filePath ? track.filePath.split("/").pop() : undefined);
  if (!fileName) return null;
  return {
    assetId: `primary:${track.trackId}`,
    format: track.fileExtension ? formatFromExtension(track.fileExtension) : formatFromExtension(fileName),
    fileName,
    filePath: track.audioRelPath ?? track.filePath ?? fileName,
    checksum: null, // legacy data predates checksum computation
    durationSeconds: track.durationSeconds,
    sourceOwner: track.sourceOwner ?? "unknown",
    addedAt: (track as unknown as { createdAt?: string }).createdAt ?? "",
    isPrimary: true,
  };
}

/** The full known set of physical assets for a track — real `assets` when present, else a synthesized single-entry legacy view. */
export function getTrackAssets(track: Track): TrackAsset[] {
  if (track.assets && track.assets.length > 0) return track.assets;
  const primary = buildPrimaryAssetFromTrack(track);
  return primary ? [primary] : [];
}

export function getTrackFormats(track: Track): TrackAssetFormat[] {
  return Array.from(new Set(getTrackAssets(track).map((a) => a.format)));
}

export function trackHasFormat(track: Track, format: TrackAssetFormat): boolean {
  return getTrackFormats(track).includes(format);
}

/** "Which Catalog tracks have a WAV available?" — and the FLAC/MP3 equivalents. */
export function filterTracksByFormat(tracks: Track[], format: TrackAssetFormat): Track[] {
  return tracks.filter((t) => trackHasFormat(t, format));
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface AssetReconciliationCandidate {
  fileName: string;
  format: TrackAssetFormat;
  checksum: string | null;
  durationSeconds: number | null;
  title: string;
  artist?: string;
}

function versionHintIn(fileName: string): string | null {
  const m = fileName.match(VERSION_HINT_PATTERN);
  return m ? m[0].toLowerCase() : null;
}

// Real intake titles come straight from the filename (stripExt in
// audioImport.ts — there's no separate "clean title" field), so
// "Late Drift (Extended Mix).wav" produces the literal title "Late Drift
// (Extended Mix)", not "Late Drift" — an exact-equality title comparison
// against the existing track's plain "Late Drift" would never match,
// making the related_version tier unreachable for exactly the case it
// exists to catch. This strips a trailing parenthetical or trailing
// version-hint word so that comparison still finds the relation; the
// STRICTER same_recording_different_format tier below never uses this —
// it only ever fires on an untouched exact title match.
function stripVersionHintSuffix(title: string): string {
  let stripped = title.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const trailingHint = new RegExp(`[\\s-]+(${VERSION_HINT_WORDS})\\s*$`, "i");
  stripped = stripped.replace(trailingHint, "").trim();
  return stripped;
}

function durationDelta(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return Math.abs(a - b);
}

export function classifyIncomingAsset(
  candidate: AssetReconciliationCandidate,
  existingTracks: Track[],
): AssetReconciliationResult {
  // Tier 1 — exact_asset_duplicate: checksum equality is definitive. Checked
  // across every existing track's full asset set (real + legacy-synthesized).
  if (candidate.checksum) {
    for (const track of existingTracks) {
      for (const asset of getTrackAssets(track)) {
        if (asset.checksum && asset.checksum === candidate.checksum) {
          return {
            classification: "exact_asset_duplicate",
            matchedTrackId: track.trackId,
            matchedAssetId: asset.assetId,
            evidence: {
              checksumMatch: true,
              normalizedTitleArtistMatch: false,
              durationDeltaSeconds: durationDelta(candidate.durationSeconds, asset.durationSeconds),
              filenameVersionHint: null,
              sameFormatAlreadyPresent: asset.format === candidate.format,
            },
            confidence: "high",
          };
        }
      }
    }
  }

  // Fallback exact-duplicate check for tracks with no checksum data at all
  // (legacy import, predates this build) — same filename + duration within
  // tolerance, matching the pre-existing detectDuplicate behavior so
  // coverage never regresses for older library data.
  for (const track of existingTracks) {
    const primary = getTrackAssets(track)[0];
    if (
      primary && !primary.checksum &&
      primary.fileName === candidate.fileName &&
      candidate.durationSeconds != null && primary.durationSeconds != null &&
      Math.abs(primary.durationSeconds - candidate.durationSeconds) <= DURATION_TOLERANCE_SECONDS
    ) {
      return {
        classification: "exact_asset_duplicate",
        matchedTrackId: track.trackId,
        matchedAssetId: primary.assetId,
        evidence: {
          checksumMatch: false,
          normalizedTitleArtistMatch: false,
          durationDeltaSeconds: durationDelta(candidate.durationSeconds, primary.durationSeconds),
          filenameVersionHint: null,
          sameFormatAlreadyPresent: primary.format === candidate.format,
        },
        confidence: "medium",
      };
    }
  }

  // Tier 2/3 — title+artist evidence. Never checksum-based (cross-format
  // files legitimately hash differently), so this is inherently weaker;
  // duration-within-tolerance separates a likely same-recording-different-
  // format match (tight duration agreement) from a related-but-distinct
  // version (title matches, but the running time genuinely differs, or the
  // filename itself signals an edit/alternate render).
  if (candidate.title) {
    const candTitle = normalizeForCompare(candidate.title);
    const candArtist = candidate.artist ? normalizeForCompare(candidate.artist) : "";
    const hint = versionHintIn(candidate.fileName);

    const strippedCandTitle = normalizeForCompare(stripVersionHintSuffix(candidate.title));

    for (const track of existingTracks) {
      const trackTitle = normalizeForCompare(track.title ?? "");
      if (!trackTitle) continue;
      const exactTitleMatch = trackTitle === candTitle;
      // Only treat the stripped comparison as a match when stripping
      // actually removed something — otherwise it's the same string and
      // would (correctly) already have hit exactTitleMatch above.
      const versionStrippedMatch = !exactTitleMatch && strippedCandTitle !== candTitle && trackTitle === strippedCandTitle;
      if (!exactTitleMatch && !versionStrippedMatch) continue;

      const trackArtist = normalizeForCompare(track.artist ?? "");
      if (candArtist && trackArtist && trackArtist !== candArtist) continue;

      const delta = durationDelta(candidate.durationSeconds, track.durationSeconds);
      const formats = getTrackFormats(track);
      const sameFormatAlreadyPresent = formats.includes(candidate.format);

      // The higher-confidence cross-format tier requires the STRICT,
      // untouched title match plus tight duration agreement and no
      // filename hint — a stripped-suffix match always falls through to
      // related_version below, since stripping a version hint to get a
      // match is itself evidence this is a variant, not the same file in
      // a different container.
      if (exactTitleMatch && delta != null && delta <= DURATION_TOLERANCE_SECONDS && !hint) {
        return {
          classification: "same_recording_different_format",
          matchedTrackId: track.trackId,
          matchedAssetId: null,
          evidence: {
            checksumMatch: false,
            normalizedTitleArtistMatch: true,
            durationDeltaSeconds: delta,
            filenameVersionHint: null,
            sameFormatAlreadyPresent,
          },
          confidence: "high",
        };
      }

      const effectiveHint = hint ?? (versionStrippedMatch ? versionHintIn(candidate.title) : null);
      return {
        classification: "related_version",
        matchedTrackId: track.trackId,
        matchedAssetId: null,
        evidence: {
          checksumMatch: false,
          normalizedTitleArtistMatch: exactTitleMatch,
          durationDeltaSeconds: delta,
          filenameVersionHint: effectiveHint,
          sameFormatAlreadyPresent,
        },
        confidence: effectiveHint ? "medium" : "low",
      };
    }
  }

  return {
    classification: "distinct_recording",
    matchedTrackId: null,
    matchedAssetId: null,
    evidence: {
      checksumMatch: false,
      normalizedTitleArtistMatch: false,
      durationDeltaSeconds: null,
      filenameVersionHint: null,
      sameFormatAlreadyPresent: false,
    },
    confidence: "high",
  };
}

// ---------------------------------------------------------------------------
// Attachment — only ever called after an explicit human decision (see
// ImportIntakePanel's "Attach as Additional Format" action). Never invoked
// automatically by classifyIncomingAsset itself.
// ---------------------------------------------------------------------------

export function attachAssetToTrack(tracks: Track[], targetTrackId: string, newAsset: TrackAsset): Track[] {
  return tracks.map((t) => {
    if (t.trackId !== targetTrackId) return t;
    const existingAssets = getTrackAssets(t); // seeds the array with the legacy primary if this is its first real asset
    return { ...t, assets: [...existingAssets, newAsset] };
  });
}

// ---------------------------------------------------------------------------
// Suno canonical-recording evidence bridge (read-only, optional, informational)
// ---------------------------------------------------------------------------

interface SunoCanonicalRecordingLite {
  canonicalRecordingId: string;
  primaryTitleGuess: string | null;
  sunoUuid: string | null;
  workspaceSlugs: string[];
  totalDurationSeconds: number;
}

/**
 * Checks a candidate file's filename-derived title/duration against the
 * EXISTING SunoCanonicalRecording set (already built by
 * canonicalIdentity.ts from the loaded Suno manifests — never rebuilt or
 * duplicated here) for a plausible match. Title/duration is the same
 * (deliberately weaker) evidence tier used for same_recording_different_format
 * above, not the UUID/checksum tiers Suno's own identity system uses
 * internally for ITS canonical grouping — this function makes no identity
 * claim, only surfaces "this might be your local copy of this Suno
 * recording" as a hint for the human reviewing the import. It never
 * resolves to a Track and is never consulted by classifyIncomingAsset.
 */
export function findMatchingSunoCanonicalRecording(
  candidate: { title: string; durationSeconds: number | null },
  sunoCanonicalRecordings: SunoCanonicalRecordingLite[],
): SunoCanonicalEvidenceMatch | null {
  const candTitle = normalizeForCompare(candidate.title);
  if (!candTitle) return null;
  for (const rec of sunoCanonicalRecordings) {
    if (!rec.primaryTitleGuess) continue;
    if (normalizeForCompare(rec.primaryTitleGuess) !== candTitle) continue;
    const delta = durationDelta(candidate.durationSeconds, rec.totalDurationSeconds);
    if (delta != null && delta > DURATION_TOLERANCE_SECONDS) continue;
    return {
      canonicalRecordingId: rec.canonicalRecordingId,
      primaryTitleGuess: rec.primaryTitleGuess,
      sunoUuid: rec.sunoUuid,
      workspaceSlugs: rec.workspaceSlugs,
      durationDeltaSeconds: delta,
    };
  }
  return null;
}

export type { AssetReconciliationClass, AssetReconciliationEvidence };
