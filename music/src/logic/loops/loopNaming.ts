// Sectional Looper and Loop Library — file naming (§19). Pure, testable.
// `<Artist> - <Track> - <Section> - <Bars>bar - <BPM>bpm.wav`. Stable
// internal IDs (LoopAsset.id) remain authoritative; this is a display/export
// filename only, never used as a lookup key.

function sanitize(part: string): string {
  return part
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildLoopFileName(params: {
  artist?: string;
  trackTitle: string;
  sectionLabel: string;
  barCount?: number;
  bpm?: number;
  extension?: string;
}): string {
  const { artist, trackTitle, sectionLabel, barCount, bpm, extension = "wav" } = params;
  const parts = [
    artist ? sanitize(artist) : undefined,
    sanitize(trackTitle),
    sanitize(sectionLabel),
    barCount != null ? `${Math.round(barCount)}bar` : undefined,
    bpm != null ? `${Math.round(bpm)}bpm` : undefined,
  ].filter((p): p is string => !!p && p.length > 0);
  return `${parts.join(" - ")}.${extension}`;
}
