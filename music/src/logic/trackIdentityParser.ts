// Track identity parser (0705Q)
// Parses artist/title/trackNumber from filenames and imported title strings.

import type { TrackIdentityStatus, TrackIdentitySource } from "../data/trackTypes";

export type ParsedTrackIdentity = {
  trackNumber?: number;
  artist?: string;
  title?: string;
  identityStatus: TrackIdentityStatus;
  identitySource: TrackIdentitySource;
  identityConfidence: number;
  reason: string;
};

// Patterns: "01 ", "01. ", "01 - ", "01- ", "1-01 ", "Track 01 - "
const TRACK_NUM_RE = /^(?:track\s+)?(\d{1,3})(?:[.\s_\-]+)/i;
const DISC_TRACK_RE = /^(\d+)-(\d{1,3})\s+/;
const SEPARATORS = [" — ", " – ", " - ", " _ "];

export function normalizeTrackNumber(raw: string | number | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return isNaN(n) || n <= 0 ? undefined : n;
}

export function parseTrackIdentityFromFilename(filename: string): ParsedTrackIdentity {
  const ext = filename.lastIndexOf(".");
  const stem = (ext >= 0 ? filename.slice(0, ext) : filename).trim();
  return _parseIdentityFromStem(stem, "filename");
}

export function parseTrackIdentityFromTitle(title: string): ParsedTrackIdentity {
  return _parseIdentityFromStem(title.trim(), "import");
}

function _parseIdentityFromStem(stem: string, source: TrackIdentitySource): ParsedTrackIdentity {
  let working = stem;
  let trackNumber: number | undefined;

  // Disc-track prefix: "1-01 Artist - Title"
  const discMatch = DISC_TRACK_RE.exec(working);
  if (discMatch) {
    trackNumber = parseInt(discMatch[2], 10);
    working = working.slice(discMatch[0].length).trim();
  } else {
    const numMatch = TRACK_NUM_RE.exec(working);
    if (numMatch) {
      trackNumber = parseInt(numMatch[1], 10);
      working = working.slice(numMatch[0].length).trim();
    }
  }

  // Try separators
  for (const sep of SEPARATORS) {
    const idx = working.indexOf(sep);
    if (idx > 0) {
      const left = working.slice(0, idx).trim();
      const right = working.slice(idx + sep.length).trim();
      if (left && right) {
        const confidence = trackNumber != null ? 0.85 : 0.92;
        return {
          trackNumber,
          artist: left,
          title: right,
          identityStatus: trackNumber != null ? "track_number_detected" : "clean",
          identitySource: source,
          identityConfidence: confidence,
          reason: trackNumber != null
            ? `track number + "Artist${sep}Title" pattern`
            : `"Artist${sep}Title" pattern`,
        };
      }
    }
  }

  // No separator found — numeric stem
  if (/^\d+$/.test(working)) {
    return {
      trackNumber,
      identityStatus: "filename_only",
      identitySource: source,
      identityConfidence: 0.1,
      reason: "numeric stem — no identity extractable",
    };
  }

  // Single token slug — treat as title
  const slug = working.replace(/[-_]+/g, " ").trim();
  if (trackNumber != null) {
    // Had a track number but no separator — title only
    return {
      trackNumber,
      title: slug,
      identityStatus: "artist_missing",
      identitySource: source,
      identityConfidence: 0.55,
      reason: "track number found, title only — no artist separator",
    };
  }

  return {
    title: slug,
    identityStatus: "artist_missing",
    identitySource: source,
    identityConfidence: 0.45,
    reason: "no Artist–Title separator — using full stem as title",
  };
}

export function scoreIdentityParse(
  hasArtist: boolean,
  hasTitle: boolean,
  source: TrackIdentitySource,
  parsed: ParsedTrackIdentity,
): number {
  if (source === "manual") return 0.97;
  if (source === "tag" && hasArtist && hasTitle) return 0.95;
  return parsed.identityConfidence;
}

export function formatCanonicalArtistTitle(artist: string | undefined, title: string): string {
  if (!artist?.trim()) return title;
  const t = title.toLowerCase();
  const a = artist.toLowerCase();
  if (t.startsWith(a) || t.includes(` - ${a}`)) return title;
  return `${artist} — ${title}`;
}

// ── Post-artist title cleanup helpers (0705S) ─────────────────────────────────

// "01. Artist - Title" or "Artist - Title" → groups: [trackNum?, artistPrefix, title]
const POST_ARTIST_RE = /^\s*(?:(\d{1,3})[.\-_\s]+)?(.+?)\s+[-–—]\s+(.+?)\s*$/;

export function normalizeArtistForComparison(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type PostArtistCleanupResult = {
  cleanTitle: string;
  trackNumber?: number;
  artistMatch: "exact" | "close" | "none";
  confidence: number;
};

export function parsePostArtistTitleCleanup(
  title: string,
  artist: string,
): PostArtistCleanupResult | null {
  if (!title?.trim() || !artist?.trim()) return null;

  const m = POST_ARTIST_RE.exec(title);
  if (!m) return null;

  const [, numStr, parsedArtist, cleanTitle] = m;
  if (!cleanTitle?.trim()) return null;
  // Reject if cleaned title equals artist (degenerate case)
  if (cleanTitle.trim().toLowerCase() === artist.trim().toLowerCase()) return null;

  const trackNumber = numStr ? parseInt(numStr, 10) : undefined;
  const normParsed = normalizeArtistForComparison(parsedArtist);
  const normExisting = normalizeArtistForComparison(artist);

  let artistMatch: PostArtistCleanupResult["artistMatch"];
  let confidence: number;

  if (normParsed === normExisting) {
    artistMatch = "exact";
    confidence = trackNumber != null ? 0.92 : 0.95;
  } else if (
    normExisting.includes(normParsed) ||
    normParsed.includes(normExisting) ||
    levenshteinRatio(normParsed, normExisting) >= 0.80
  ) {
    artistMatch = "close";
    confidence = 0.72;
  } else {
    return null; // artist mismatch — not a cleanup candidate
  }

  return { cleanTitle: cleanTitle.trim(), trackNumber, artistMatch, confidence };
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const dp: number[] = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    let prev = i;
    for (let j = 1; j <= lb; j++) {
      const val = a[i - 1] === b[j - 1] ? dp[j - 1] : Math.min(dp[j - 1], dp[j], prev) + 1;
      dp[j - 1] = prev;
      prev = val;
    }
    dp[lb] = prev;
  }
  return 1 - dp[lb] / Math.max(la, lb);
}
