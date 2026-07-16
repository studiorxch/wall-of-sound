// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export §2 —
// "natural regions as the primary choice." A new, separate, always-visible
// strip below the waveform — NOT an interactive layer added to the
// existing GridBackdropLayer overlay (which stays exactly as-is,
// pointer-events: none, fully decorative). One button per detected
// StructuralSectionBand.

import type { StructuralSectionBand } from "../../data/loopTypes";
import type { RegionEligibility } from "../../logic/loops/regionEligibility";

export type RegionUserState = "unheard" | "heard" | "selected" | "rejected";

interface RegionStripProps {
  bands: StructuralSectionBand[];
  eligibility: RegionEligibility[];
  regionState: Record<string, RegionUserState>;
  activeRegionId: string | undefined;
  onSelectRegion: (band: StructuralSectionBand) => void;
}

export function RegionStrip({ bands, eligibility, regionState, activeRegionId, onSelectRegion }: RegionStripProps) {
  if (bands.length === 0) return null;
  return (
    <div className="looper-region-strip" role="tablist" aria-label="Natural regions">
      {bands.map((band) => {
        const eligible = eligibility.find((e) => e.bandId === band.id)?.eligible ?? true;
        const state = regionState[band.id] ?? "unheard";
        const isActive = band.id === activeRegionId;
        return (
          <button
            key={band.id}
            role="tab"
            aria-selected={isActive}
            className={`looper-region-chip is-${state}${isActive ? " is-active" : ""}${eligible ? "" : " is-deprioritized"}`}
            onClick={() => onSelectRegion(band)}
          >
            {band.displayLabel}
          </button>
        );
      })}
    </div>
  );
}
