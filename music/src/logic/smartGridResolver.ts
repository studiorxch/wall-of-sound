// Smart Grid preset resolver (0621H).
// Pure mapping from resolved schedule → composition. Never throws on malformed
// input. Uses the 0621G ScheduleBlock field names (`displayMode`, `role`).

import type { ResolvedSchedule, ScheduleBlock } from "../data/scheduleTypes";
import type {
  SmartGridComposition,
  SmartGridPreset,
  SmartGridRegion,
} from "../data/smartGridTypes";

const DEFAULT_COLUMNS = 6;
const DEFAULT_ROWS = 4;

/** Pick the preset from the active block's displayMode + role. */
export function pickPreset(active: ScheduleBlock | null | undefined): SmartGridPreset {
  if (!active) return "full_scene";

  // Role takes precedence for bumper/event temporary treatments.
  if (active.role === "bumper") return "bumper_card";

  switch (active.displayMode) {
    case "full_scene":  return "full_scene";
    case "overlay":     return "lower_third";
    case "map_channel": return "map_channel";
    case "grid":
      return active.role === "event" ? "guide_preview" : "bumper_card";
    default:
      return active.role === "event" ? "guide_preview" : "full_scene";
  }
}

function regionsForPreset(
  preset: SmartGridPreset,
  columns: number,
  rows: number,
  hasNext: boolean,
): SmartGridRegion[] {
  // Atmosphere always underlies everything (full surface).
  const atmosphere: SmartGridRegion = {
    regionId: "r_atmosphere",
    regionType: "atmosphere",
    columnStart: 1, columnSpan: columns,
    rowStart: 1, rowSpan: rows,
  };

  switch (preset) {
    case "full_scene":
      return [atmosphere];

    case "lower_third":
      return [
        atmosphere,
        {
          regionId: "r_program",
          regionType: "program_line",
          columnStart: 1, columnSpan: columns,
          rowStart: rows, rowSpan: 1,
          label: "PROGRAM",
        },
      ];

    case "guide_preview":
      // Small next-block preview, top-right — only when a next block exists.
      return hasNext
        ? [
            atmosphere,
            {
              regionId: "r_preview",
              regionType: "schedule_preview",
              columnStart: Math.max(1, columns - 1), columnSpan: 2,
              rowStart: 1, rowSpan: 1,
              label: "NEXT",
            },
          ]
        : [atmosphere];

    case "map_channel":
      // Reserve a major upper region for a future WOS/map feed.
      return [
        atmosphere,
        {
          regionId: "r_map",
          regionType: "map_placeholder",
          columnStart: 1, columnSpan: columns,
          rowStart: 1, rowSpan: Math.max(1, rows - 1),
          label: "WOS / MAP",
        },
      ];

    case "bumper_card":
      // Centered card region (does not render content — secondary cards own that).
      return [
        atmosphere,
        {
          regionId: "r_bumper",
          regionType: "bumper_card",
          columnStart: Math.max(1, Math.floor(columns / 2) - 1), columnSpan: 3,
          rowStart: Math.max(1, Math.floor(rows / 2)), rowSpan: 2,
          label: "BUMPER",
        },
      ];

    default:
      return [atmosphere];
  }
}

export function resolveSmartGridComposition(params: {
  resolvedSchedule?: ResolvedSchedule;
  columns?: number;
  rows?: number;
}): SmartGridComposition {
  const columns = params.columns ?? DEFAULT_COLUMNS;
  const rows = params.rows ?? DEFAULT_ROWS;
  const active = params.resolvedSchedule?.now ?? null;
  const next = params.resolvedSchedule?.next ?? null;

  const preset = pickPreset(active);
  const regions = regionsForPreset(preset, columns, rows, !!next);

  return {
    preset,
    columns,
    rows,
    regions,
    activeBlockId: active?.blockId,
    nextBlockId: next?.blockId,
  };
}
