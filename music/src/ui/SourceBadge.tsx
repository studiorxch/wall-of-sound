import type { TrackSourceOwner } from "../data/trackTypes";
import type { Track } from "../data/trackTypes";

/**
 * Source badge labels and style keys.
 * CSS classes (badge-teal / badge-ext / badge-ref) already defined in styles.css.
 */
export type SourceKey = "CAT" | "EXT" | "REF" | "UNK";

const SOURCE_KEY_MAP: Record<TrackSourceOwner, SourceKey> = {
  studiorich: "CAT",
  external:   "EXT",
  reference:  "REF",
  unknown:    "UNK",
};

const BADGE_CLS: Record<SourceKey, string> = {
  CAT: "badge-teal",
  EXT: "badge-ext",
  REF: "badge-ref",
  UNK: "badge-unk",
};

type SourceBadgeProps = {
  source: TrackSourceOwner | SourceKey;
  className?: string;
};

/** Single source badge — CAT / EXT / REF / UNK. */
export function SourceBadge({ source, className = "" }: SourceBadgeProps) {
  const key: SourceKey = source in SOURCE_KEY_MAP
    ? SOURCE_KEY_MAP[source as TrackSourceOwner]
    : source as SourceKey;
  const cls = BADGE_CLS[key] ?? "badge-unk";
  return (
    <span className={`warn-badge ${cls}${className ? ` ${className}` : ""}`}>{key}</span>
  );
}

/**
 * Derives the source composition of a set of tracks.
 * Returns a sorted, deduplicated list of SourceKeys present.
 * e.g. ["CAT", "EXT"] for a mixed Catalog+External playlist.
 */
export function getSourceComposition(trackIds: (string | undefined)[], libraryTracks: Track[]): SourceKey[] {
  const tbm = new Map(libraryTracks.map((t) => [t.trackId, t]));
  const keys = new Set<SourceKey>();
  for (const id of trackIds) {
    if (!id) continue;
    const t = tbm.get(id);
    if (!t || !t.sourceOwner) continue;
    const key = SOURCE_KEY_MAP[t.sourceOwner];
    if (key) keys.add(key);
  }
  // Canonical order: CAT, EXT, REF, UNK
  const order: SourceKey[] = ["CAT", "EXT", "REF", "UNK"];
  return order.filter((k) => keys.has(k));
}

/** Row of source badges for a composition, e.g. <CAT> <EXT>. */
export function SourceCompositionBadges({ composition, className }: { composition: SourceKey[]; className?: string }) {
  if (composition.length === 0) return null;
  return (
    <>
      {composition.map((k) => (
        <SourceBadge key={k} source={k} className={className} />
      ))}
    </>
  );
}
