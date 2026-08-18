import { describe, it, expect } from "vitest";
import { serializeSession, deserializeStrokes } from "./graffitiArtworkSerializer";
import { createSession, startStroke, commitStroke } from "./graffitiStrokeStore";
import type { StrokePoint } from "./graffitiTypes";

// BUILD §33 categories 8-9.

const POINT: StrokePoint = { x: 0.2, y: 0.3, pointerType: "mouse", timestamp: 1000 };

describe("stroke serialization (#8)", () => {
  it("serializeSession produces a versioned payload with the exact strokes/canvas dimensions/target mode", () => {
    let session = createSession({ kind: "sticker" }, 1000, 1000, ["#ff0000"], 1000);
    const stroke = startStroke("marker", "#ff0000", 0.02, POINT, 1000);
    session = commitStroke(session, stroke, 1001);

    const payload = serializeSession(session);
    expect(payload.version).toBe(1);
    expect(payload.canvasWidth).toBe(1000);
    expect(payload.canvasHeight).toBe(1000);
    expect(payload.strokes).toHaveLength(1);
    expect(payload.strokes[0].id).toBe(stroke.id);
    expect(payload.targetMode).toEqual({ kind: "sticker" });
  });
});

describe("stroke deserialization (#9)", () => {
  it("round-trips a serialized payload back into an identical strokes array", () => {
    let session = createSession({ kind: "sticker" }, 800, 800, [], 2000);
    const stroke = startStroke("fatcap", "#00ff44", 0.03, POINT, 2000);
    session = commitStroke(session, stroke, 2001);
    const payload = serializeSession(session);

    const result = deserializeStrokes(payload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.strokes).toEqual(session.strokes);
    }
  });

  it("rejects a payload with an unsupported version rather than silently misrendering it", () => {
    const result = deserializeStrokes({ version: 2, strokes: [], canvasWidth: 1, canvasHeight: 1 });
    expect(result).toEqual({ ok: false, reason: "unsupported_version" });
  });

  it("rejects a payload missing strokes entirely", () => {
    const result = deserializeStrokes({ version: 1 });
    expect(result).toEqual({ ok: false, reason: "missing_strokes" });
  });

  it("rejects a non-object payload", () => {
    expect(deserializeStrokes(null)).toEqual({ ok: false, reason: "invalid_payload" });
    expect(deserializeStrokes("not an object")).toEqual({ ok: false, reason: "invalid_payload" });
  });
});
