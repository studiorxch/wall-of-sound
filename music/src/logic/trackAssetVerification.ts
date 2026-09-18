// MUSIC Catalog Technical Format Verification — foundation
// (0827_MUSIC_CatalogTechnicalFormatVerification). Pure normalization only:
// maps raw ffprobe-reported container/codec strings onto MUSIC's existing
// TrackAssetFormat vocabulary. Read-only evidence in, a label out — never
// mutates TrackAsset.format, never touches file paths/identity. No consumer
// (trackHasFormat, dashboard counts, Track Inspector badges, filters) reads
// this yet — this module exists so the mapping itself can be inspected and
// tested before anything trusts it.

import type { TrackAssetFormat } from "../data/trackAssetTypes";

export function normalizeVerifiedFormat(
  containerFormat: string | null,
  audioCodec: string | null,
): TrackAssetFormat | "unknown" {
  const container = (containerFormat ?? "").toLowerCase();
  const codec = (audioCodec ?? "").toLowerCase();
  if (!container && !codec) return "unknown";

  // WAV/PCM — container is the definitive signal; any pcm_* codec variant
  // (endianness/bit depth) still means "this is a WAV," matching the same
  // rule Song Library's own isWavLocation already uses.
  if (container === "wav" || codec.startsWith("pcm_")) return "wav";
  if (codec === "flac") return "flac";
  if (container === "aiff" || container === "aif") return "aiff";
  if (codec === "opus") return "opus";
  // ffprobe reports the MP4-family container as one combined string
  // ("mov,mp4,m4a,3gp,3g2,mj2") regardless of the actual extension used —
  // AAC audio inside that container family is M4A; AAC elsewhere (a bare
  // .aac stream) stays "aac".
  if (codec === "aac" && /mp4|m4a|mov/.test(container)) return "m4a";
  if (codec === "aac") return "aac";
  if (codec === "mp3" || codec === "mp3float") return "mp3";
  if (container.includes("ogg") && codec !== "opus") return "ogg";
  return "other";
}
