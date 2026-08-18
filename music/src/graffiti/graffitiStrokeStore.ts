// ── graffitiStrokeStore ────────────────────────────────────────────────────────
// Pure functions over ArtworkCreationSession — no class, no hidden state,
// same "authority operates on plain data, caller holds the reference"
// convention as every wall*Authority.js in this codebase. GraffitiCanvas.tsx
// wraps these in React state; nothing here touches React or the DOM.
//
// The session itself is explicitly temporary working state (BUILD §5) — it
// never becomes the persistent Artwork identity; graffitiArtworkSerializer.ts
// is the only bridge from a session to a real sr-art-* record.

import type { ArtworkCreationSession, BrushId, DrawingTargetMode, Stroke, StrokePoint } from "./graffitiTypes";
import { makeStrokeSeed } from "./graffitiRandom";

let _sessionCounter = 0;
let _strokeCounter = 0;

export function createSession(targetMode: DrawingTargetMode, canvasWidth: number, canvasHeight: number, palette: string[], now: number): ArtworkCreationSession {
  _sessionCounter++;
  return {
    id: `gsession-${now}-${_sessionCounter}`,
    targetMode,
    canvasWidth, canvasHeight,
    strokes: [],
    palette,
    createdAt: now, updatedAt: now,
    dirty: false,
  };
}

export function startStroke(tool: BrushId, color: string, baseWidth: number, firstPoint: StrokePoint, now: number): Stroke {
  _strokeCounter++;
  return {
    id: `gstroke-${now}-${_strokeCounter}`,
    tool, color, baseWidth,
    points: [firstPoint],
    seed: makeStrokeSeed(_strokeCounter),
    createdAt: now,
  };
}

export function addPointToStroke(stroke: Stroke, point: StrokePoint): Stroke {
  return { ...stroke, points: [...stroke.points, point] };
}

// Commits a finished stroke into the session — returns a NEW session object
// (immutable update), same convention React state setters expect.
export function commitStroke(session: ArtworkCreationSession, stroke: Stroke, now: number): ArtworkCreationSession {
  return { ...session, strokes: [...session.strokes, stroke], updatedAt: now, dirty: true };
}
