export type FilenameIdentitySuggestion = {
  title?: string;
  artist?: string;
  confidence: "high" | "medium" | "low";
  reason: string;
};

const TRACK_NUM = /^(\d{1,3})[.\s_\-]+/;
const SEPARATORS = [" - ", " – ", " — ", " _ "];

export function suggestIdentityFromFilename(filename: string): FilenameIdentitySuggestion {
  const ext = filename.lastIndexOf(".");
  const stem = ext >= 0 ? filename.slice(0, ext) : filename;

  // Strip leading track number
  let working = stem.replace(TRACK_NUM, "").trim();
  const hadTrackNum = TRACK_NUM.test(stem);

  // Try each separator
  for (const sep of SEPARATORS) {
    const idx = working.indexOf(sep);
    if (idx > 0) {
      const left = working.slice(0, idx).trim();
      const right = working.slice(idx + sep.length).trim();
      if (left && right) {
        return {
          artist: left,
          title: right,
          confidence: hadTrackNum ? "medium" : "high",
          reason: hadTrackNum
            ? `track-number + "Artist${sep}Title" pattern`
            : `"Artist${sep}Title" pattern`,
        };
      }
    }
  }

  // All-numeric stem
  if (/^\d+$/.test(working)) {
    return {
      confidence: "low",
      reason: "numeric filename — no identity extractable",
    };
  }

  // Single-word or slug (e.g. "386-tender", "track_01_something")
  const slug = working.replace(/[-_]+/g, " ").trim();
  if (!slug.includes(" ")) {
    return {
      title: slug,
      confidence: "low",
      reason: "single-token filename — title only, no artist",
    };
  }

  // Multi-word slug with no separator: treat whole thing as title
  return {
    title: slug,
    confidence: "low",
    reason: "no Artist–Title separator found — using full stem as title",
  };
}

export function isNumericFilename(filename: string): boolean {
  const ext = filename.lastIndexOf(".");
  const stem = ext >= 0 ? filename.slice(0, ext) : filename;
  return /^\d+$/.test(stem.trim());
}

export function isBadFilenameParse(title: string, filename: string): boolean {
  if (!title) return false;
  const ext = filename.lastIndexOf(".");
  const stem = (ext >= 0 ? filename.slice(0, ext) : filename).replace(/[-_]+/g, " ").trim().toLowerCase();
  return title.trim().toLowerCase() === stem;
}
