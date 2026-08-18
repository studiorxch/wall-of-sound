// ── graffitiArtworkSerializer ─────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §9
//
// The ONE bridge from a temporary ArtworkCreationSession to a persistable
// payload. Produces structured stroke data (round-trippable — BUILD §9
// "preserve structured drawing data") separately from an optional raster
// preview (a canvas.toDataURL() call the caller supplies — this module
// stays canvas-agnostic/pure so it's plain-Vitest-testable).

import type { ArtworkCreationSession, SerializedArtworkPayload, Stroke } from "./graffitiTypes";

export function serializeSession(session: ArtworkCreationSession): SerializedArtworkPayload {
  return {
    version: 1,
    canvasWidth: session.canvasWidth,
    canvasHeight: session.canvasHeight,
    strokes: session.strokes,
    targetMode: session.targetMode,
  };
}

// Round-trip: rebuilds strokes[] from a previously-serialized payload.
// Validates the version tag explicitly rather than assuming shape — a
// future format change gets a clear "unsupported_version" rather than a
// silent misrender.
export function deserializeStrokes(payload: unknown): { ok: true; strokes: Stroke[] } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "invalid_payload" };
  const p = payload as Partial<SerializedArtworkPayload>;
  if (p.version !== 1) return { ok: false, reason: "unsupported_version" };
  if (!Array.isArray(p.strokes)) return { ok: false, reason: "missing_strokes" };
  return { ok: true, strokes: p.strokes };
}
