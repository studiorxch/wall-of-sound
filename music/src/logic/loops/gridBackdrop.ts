// 0715A_MUSIC_Looper_Grid_Backdrop_And_Structural_Section_Overlay —
// derives grid-backdrop bands (§5-§9) purely from an existing MusicalGrid's
// own `barFrames` array (never re-derives timing, never a second timing
// authority — §6's own explicit requirement). Bar/4/8/16 hierarchy only.

import type { GridBackdropBand, GridBackdropLevel } from "../../data/loopTypes";

function genBandId(level: GridBackdropLevel, index: number): string {
  return `gridband_${level}_${index}`;
}

// §7-§9 — groups consecutive bars into bands of `barsPerGroup` bars each,
// using the grid's own real bar-start frames. The final group may be a
// correct partial group when barFrames.length doesn't divide evenly —
// never an inverted or fabricated range.
function buildLevelBands(
  barFrames: number[], barsPerGroup: number, level: GridBackdropLevel, emphasized: boolean,
): GridBackdropBand[] {
  if (barFrames.length < 2) return [];
  const bands: GridBackdropBand[] = [];
  let groupIndex = 0;
  for (let startBarIdx = 0; startBarIdx < barFrames.length - 1; startBarIdx += barsPerGroup) {
    const endBarIdx = Math.min(startBarIdx + barsPerGroup, barFrames.length - 1);
    if (endBarIdx <= startBarIdx) break;
    bands.push({
      id: genBandId(level, groupIndex),
      startFrame: barFrames[startBarIdx],
      endFrame: barFrames[endBarIdx],
      startBar: startBarIdx + 1,
      endBar: endBarIdx + 1,
      level,
      emphasized,
      alternateIndex: groupIndex % 2,
    });
    groupIndex++;
  }
  return bands;
}

export interface GridBackdropLevels {
  bar: GridBackdropBand[];
  group4: GridBackdropBand[];
  group8: GridBackdropBand[];
  group16: GridBackdropBand[];
}

// §6 — the full four-level hierarchy in one call. `bar` bands are
// single-bar-wide (used for thin grid lines, not fills); group4/8/16 are
// the grouping bands (§7-§9).
export function buildGridBackdropBands(barFrames: number[]): GridBackdropLevels {
  return {
    bar: buildLevelBands(barFrames, 1, "bar", false),
    group4: buildLevelBands(barFrames, 4, "group4", false),
    group8: buildLevelBands(barFrames, 8, "group8", false),
    group16: buildLevelBands(barFrames, 16, "group16", true),
  };
}

// §22 — the "Grouping" display control's strongest visual rhythm.
export type GroupingEmphasis = 4 | 8 | 16;

export function bandsForGroupingEmphasis(levels: GridBackdropLevels, emphasis: GroupingEmphasis): GridBackdropBand[] {
  if (emphasis === 4) return levels.group4;
  if (emphasis === 16) return levels.group16;
  return levels.group8;
}
