const SMART_QUOTES: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"',
  "′": "'", "″": '"',
};

function replaceSmartQuotes(s: string): string {
  return s.replace(/[‘’“”′″]/g, (c) => SMART_QUOTES[c] ?? c);
}

export function normalizeArtistName(value: string): string {
  return replaceSmartQuotes(value)
    .normalize("NFC")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function artistNameToFilename(value: string): string {
  return replaceSmartQuotes(value)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/\//g, "_")
    .replace(/:/g, "_")
    .replace(/&/g, "And");
}

export function artistNameToId(value: string): string {
  return normalizeArtistName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function normalizeTrackTitle(value: string): string {
  return replaceSmartQuotes(value)
    .replace(/_/g, " ")
    .replace(/\.[^.]+$/, "") // strip extension
    .replace(/\s+/g, " ")
    .trim();
}

const MULTI_ARTIST_SEPARATORS = [
  / feat\. /i,
  / ft\. /i,
  / featuring /i,
  / & /,
  / x /i,
  / vs\. /i,
  /,\s*/,
];

export function splitArtistList(value: string): string[] {
  const normalized = normalizeArtistName(value);
  for (const sep of MULTI_ARTIST_SEPARATORS) {
    const parts = normalized.split(sep).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }
  return [normalized];
}
