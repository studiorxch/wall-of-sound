// ── graffitiTypes ──────────────────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0
//
// Core data model for StudioRich's graffiti Drawing App. Deliberately
// framework-agnostic (no React, no DOM types beyond what Pointer Events
// itself defines) so the engine underneath is pure, deterministic, and
// testable with plain Vitest — GraffitiCanvas.tsx is the only file that
// touches React.
//
// A StrokePoint never fabricates a stylus metric the browser didn't supply
// (BUILD §6) — pressure/tiltX/tiltY/twist/velocity are all optional and
// left undefined rather than defaulted to a fake value; brushes fall back
// to a documented default only at RENDER time, never at capture time.
//
// "generated" (0818_SUBWAY_Resident_Graffiti_Artists_v1.0.0 — BUILD §13) is
// a real, distinct fourth pointerType — never "mouse" — used ONLY by
// residentArtworkGenerator.ts for Resident-authored points. It exists so a
// generated stroke's provenance is honestly labeled at the type level
// (synthetic/generative metadata, never presented as observed human input)
// rather than overloading "mouse" (which already carries the specific
// meaning "real device, no pressure hardware" throughout this module).

export type BrushId = "marker" | "fatcap" | "mop";

export type PointerKind = "mouse" | "touch" | "pen" | "generated";

export interface StrokePoint {
  x: number; // normalized surface-space, 0..1 — never raw browser pixels (BUILD §18)
  y: number;
  pressure?: number; // 0..1, only when the browser/device actually reports one
  tiltX?: number; // degrees, -90..90
  tiltY?: number;
  twist?: number; // degrees, 0..359
  pointerType: PointerKind;
  timestamp: number;
  velocity?: number; // normalized units/ms, derived from the preceding point — never fabricated for the first point of a stroke
}

export interface Stroke {
  id: string;
  tool: BrushId;
  color: string; // CSS hex
  baseWidth: number; // normalized surface-space width (fraction of canvas width)
  points: StrokePoint[];
  seed: number; // deterministic PRNG seed, fixed at stroke creation — makes fatcap/mop replay pixel-identical every time (BUILD §11/§12)
  createdAt: number;
}

export type DrawingTargetMode =
  | { kind: "sticker" }
  | { kind: "car_surface"; surfaceId: string; surfaceType: "exterior_side_a" | "exterior_side_b"; logicalCarId: string; consistId: string; logicalTrainId: string; routeId: string };

export interface ArtworkCreationSession {
  id: string;
  targetMode: DrawingTargetMode;
  canvasWidth: number; // normalized-space canvas dimensions (aspect ratio reference, e.g. 1000x1000 or 1000x350)
  canvasHeight: number;
  strokes: Stroke[];
  palette: string[]; // recent/available colors for this session
  createdAt: number;
  updatedAt: number;
  dirty: boolean;
}

// A single undoable action — BUILD §15: history operates on drawing
// actions, not a flattened bitmap. "clear" is itself one undoable action
// (restores every stroke that existed before it) unless explicitly
// confirmed as a permanent reset by the caller.
export type HistoryAction =
  | { type: "add_stroke"; stroke: Stroke }
  | { type: "clear"; removedStrokes: Stroke[] };

export interface HistoryState {
  undoStack: HistoryAction[];
  redoStack: HistoryAction[];
}

export interface SerializedArtworkPayload {
  version: 1;
  canvasWidth: number;
  canvasHeight: number;
  strokes: Stroke[];
  targetMode: DrawingTargetMode;
}

// 0818_SUBWAY_Resident_Graffiti_Artists_v1.0.0 — BUILD §12. Inspectable,
// reproducible intermediate step between a Resident's style profile and
// the structured strokes actually generated from it — never itself the
// persistent Artwork identity (BUILD §5 "the drawing session is temporary
// working state").
export interface ResidentArtworkIntent {
  residentId: string;
  styleProfileId: string;
  toolSequence: BrushId[];
  palette: string[];
  strokeCount: number;
  compositionBounds: { width: number; height: number };
  seed: number;
  generatedAt: number;
}
