// 0722C_MUSIC_Production_Stem_Export — the "S" badge, occupying the
// former checkbox column. Six states; only "current" reads as prominent/
// solid — every other state is a visibly secondary/warning treatment so
// it never implies playable current stems. Color is never the only
// signal — label text differs per state too. Opens the stem sublayer only:
// never selects the row, never triggers parent playback, never touches
// grid selection state (e.stopPropagation() + no onClick reaching the row).

import type { StemSetLifecycle } from "../../data/trackStemTypes";

export type StemBadgeState = StemSetLifecycle | "processing" | "none";

const BADGE_TEXT: Record<Exclude<StemBadgeState, "none">, string> = {
  current: "S", processing: "S", outdated: "S", orphaned: "S", unavailable: "S", archived: "S",
};

const BADGE_LABEL: Record<Exclude<StemBadgeState, "none">, string> = {
  current: "Current stem set: 4 stems",
  processing: "Stem export in progress",
  outdated: "Stem set outdated — parent audio changed",
  orphaned: "Stem set orphaned — parent track missing",
  unavailable: "Stem set unavailable — archive files missing",
  archived: "Archived stem set — not current",
};

const BADGE_CLASS: Record<Exclude<StemBadgeState, "none">, string> = {
  current: "library-stem-badge library-stem-badge--current",
  processing: "library-stem-badge library-stem-badge--processing",
  outdated: "library-stem-badge library-stem-badge--warning",
  orphaned: "library-stem-badge library-stem-badge--broken",
  unavailable: "library-stem-badge library-stem-badge--warning",
  archived: "library-stem-badge library-stem-badge--muted",
};

interface Props {
  state: StemBadgeState;
  onOpen: () => void;
}

export function LibraryStemBadge({ state, onOpen }: Props) {
  if (state === "none") return <span className="library-stem-badge-empty" aria-hidden="true" />;
  return (
    <button
      type="button"
      className={BADGE_CLASS[state]}
      aria-label={BADGE_LABEL[state]}
      title={BADGE_LABEL[state]}
      aria-expanded={false}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); } }}
    >
      {BADGE_TEXT[state]}
    </button>
  );
}
