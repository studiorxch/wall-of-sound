// ── residentArtworkGenerator ──────────────────────────────────────────────────
// 0818_SUBWAY_Resident_Graffiti_Artists_v1.0.0_BUILD — §11-16
//
// Deterministic Resident style profile → structured strokes, producing REAL
// `Stroke`/`StrokePoint` objects (graffitiTypes.ts) that the existing
// Drawing App renderer (graffitiCanvasRenderer.ts / graffitiBrushRegistry.ts)
// consumes completely unmodified — no parallel raster generator, no brush
// engine duplication (BUILD §11/§14). Every point is honestly tagged
// `pointerType: "generated"` (never "mouse"/"touch"/"pen" — BUILD §13:
// "label it internally as generated/synthetic metadata rather than
// observed human input"). Given the same (residentId, styleProfileId,
// seed), generation is byte-for-byte reproducible (BUILD §16) — the only
// randomness source is graffitiRandom.ts's seeded PRNG, seeded from the
// intent's own `seed` field, never `Math.random()`.

import type { BrushId, ResidentArtworkIntent, Stroke, StrokePoint } from "./graffitiTypes";
import type { GraffitiStyleProfile, ResidentGraffitiArtist } from "../data/subwayResidentGraffitiTypes";
import { createSeededRandom } from "./graffitiRandom";
import { computeVelocity } from "./graffitiInputController";

// Inspectable, reproducible intent — the required step before any stroke
// exists (BUILD §12). Tool sequence favors the style's own affinities
// (fatcapAffinity/markerAffinity/dripAffinity) rather than picking uniformly
// among preferredTools, so a style's generated work is actually weighted
// toward its own character.
export function generateArtworkIntent(resident: ResidentGraffitiArtist, style: GraffitiStyleProfile, seed: number, now: number): ResidentArtworkIntent {
  const rand = createSeededRandom(seed + style.seedSalt);
  const strokeCount = style.strokeCountRange.min + Math.floor(rand() * (style.strokeCountRange.max - style.strokeCountRange.min + 1));

  const affinityByTool: Record<BrushId, number> = { marker: style.markerAffinity, fatcap: style.fatcapAffinity, mop: style.dripAffinity };
  const availableTools = style.preferredTools.length > 0 ? style.preferredTools : (["marker"] as BrushId[]);
  const toolSequence: BrushId[] = [];
  for (let i = 0; i < strokeCount; i++) {
    // Weighted pick: each tool's chance is proportional to its affinity
    // (falls back to uniform if every listed tool has a zero affinity).
    const weights = availableTools.map((t) => Math.max(0.05, affinityByTool[t] ?? 0.3));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rand() * total;
    let chosen = availableTools[0];
    for (let t = 0; t < availableTools.length; t++) {
      roll -= weights[t];
      if (roll <= 0) { chosen = availableTools[t]; break; }
    }
    toolSequence.push(chosen);
  }

  const palette = style.preferredColors.length > 0 ? style.preferredColors : ["#ffffff"];

  return {
    residentId: resident.id,
    styleProfileId: style.id,
    toolSequence,
    palette,
    strokeCount,
    compositionBounds: { width: 1000, height: 1000 }, // normalized-space reference; caller rescales via canvasWidth/Height at render time
    seed,
    generatedAt: now,
  };
}

function pickColor(rand: () => number, palette: string[]): string {
  return palette[Math.floor(rand() * palette.length)] ?? palette[0];
}

// Generates one deterministic stroke's point path — a seeded random walk
// whose turning behavior is parameterized directly by the style profile:
// higher `angularity` widens each turn's swing (jagged handstyle), higher
// `curvature` adds a consistent rotational drift (smooth arcing sweeps).
// `verticality`/`horizontalStretch` bias the initial heading;
// `pressureBias` (a real style PARAMETER, not fabricated hardware data) is
// applied directly as every point's `pressure` — always under
// `pointerType: "generated"`, so nothing downstream can mistake it for an
// observed device reading.
function generateStrokePoints(rand: () => number, style: GraffitiStyleProfile, canvasWidth: number, canvasHeight: number, startTime: number): StrokePoint[] {
  const pointCount = 5 + Math.round(style.complexity * 10) + Math.round(style.density * 5);
  const margin = 0.12;
  let x = margin + rand() * (1 - margin * 2);
  let y = margin + rand() * (1 - margin * 2);

  const verticalBias = style.verticality ?? 0.5;
  const horizontalBias = style.horizontalStretch ?? 0.5;
  let angle = Math.atan2(verticalBias - 0.5, horizontalBias - 0.5) + (rand() - 0.5) * Math.PI * 0.5;

  const stepLength = 0.03 + rand() * 0.04;
  const points: StrokePoint[] = [];
  let prev: StrokePoint | null = null;

  for (let i = 0; i < pointCount; i++) {
    const point: StrokePoint = {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      pointerType: "generated",
      timestamp: startTime + i * 16,
    };
    if (style.pressureBias != null) point.pressure = Math.min(1, Math.max(0, style.pressureBias + (rand() - 0.5) * 0.15));
    if (prev) point.velocity = computeVelocity(prev, point);
    points.push(point);
    prev = point;

    const turn = (rand() - 0.5) * (0.4 + style.angularity * 1.6) + style.curvature * 0.25;
    angle += turn;
    x += Math.cos(angle) * stepLength;
    y += Math.sin(angle) * stepLength;
  }

  return points;
}

// The one function that turns an intent into real, renderer-compatible
// strokes. `canvasWidth`/`canvasHeight` here are only used to derive a
// stable per-stroke seed offset (keeps strokes visually distinct across
// calls) — points themselves stay normalized 0..1, same discipline as
// every human-drawn stroke (BUILD §18).
export function generateStrokesFromIntent(intent: ResidentArtworkIntent, style: GraffitiStyleProfile): Stroke[] {
  return intent.toolSequence.map((tool, i) => {
    const strokeSeed = (intent.seed + style.seedSalt * 131 + i * 97) >>> 0;
    const rand = createSeededRandom(strokeSeed);
    const color = pickColor(rand, intent.palette);
    const baseWidth = style.widthRange.min + rand() * (style.widthRange.max - style.widthRange.min);
    const points = generateStrokePoints(rand, style, intent.compositionBounds.width, intent.compositionBounds.height, intent.generatedAt + i * 200);
    return {
      id: `gstroke-resident-${intent.residentId}-${intent.seed}-${i}`,
      tool, color, baseWidth, points,
      seed: strokeSeed,
      createdAt: intent.generatedAt,
    } satisfies Stroke;
  });
}
