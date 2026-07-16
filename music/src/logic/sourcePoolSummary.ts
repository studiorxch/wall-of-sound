import type { Track } from "../data/trackTypes";

export interface SourcePoolBadge {
  label: string;
  count: number;
  sources: Array<"catalog" | "external" | "reference">;
  stale: boolean;
  severity: "neutral" | "good" | "warning";
}

export function computeSourcePoolBadge(
  cratePoolTracks: Track[],
  isStale: boolean,
): SourcePoolBadge {
  const count = cratePoolTracks.length;
  const catCount = cratePoolTracks.filter((t) => t.sourceOwner === "studiorich").length;
  const extCount = cratePoolTracks.filter((t) => t.sourceOwner === "external").length;
  const refCount = cratePoolTracks.filter((t) => t.sourceOwner === "reference").length;

  const sources: Array<"catalog" | "external" | "reference"> = [];
  if (catCount > 0) sources.push("catalog");
  if (extCount > 0) sources.push("external");
  if (refCount > 0) sources.push("reference");

  let label: string;
  if (count === 0) {
    label = "NO SOURCE";
  } else {
    const parts: string[] = [];
    if (catCount > 0) parts.push("CAT");
    if (extCount > 0) parts.push("EXT");
    if (refCount > 0) parts.push("REF");
    label = parts.join(" + ");
    if (isStale) label += " · STALE";
  }

  const severity: SourcePoolBadge["severity"] =
    count === 0 ? "neutral" : isStale ? "warning" : "good";

  return { label, count, sources, stale: isStale, severity };
}
