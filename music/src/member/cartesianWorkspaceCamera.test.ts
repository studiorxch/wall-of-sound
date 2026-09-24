import { describe, expect, it } from "vitest";
import { createCartesianCamera } from "./cartesianWorkspaceCamera";

describe("createCartesianCamera", () => {
  it("starts at the identity view", () => {
    const camera = createCartesianCamera();
    expect(camera.getState()).toEqual({ panX: 0, panY: 0, zoom: 1 });
  });

  it("docToScreen/screenToDoc round-trip at the identity view", () => {
    const camera = createCartesianCamera();
    const doc = { x: 37, y: -12 };
    const screen = camera.docToScreen(doc, 800, 600);
    expect(camera.screenToDoc(screen.x, screen.y, 800, 600)).toEqual(doc);
  });

  it("screen -> document conversion remains stable under pan", () => {
    const camera = createCartesianCamera();
    const doc = { x: 10, y: 10 };
    const before = camera.docToScreen(doc, 800, 600);
    camera.panBy(50, -30);
    // The same DOCUMENT point now projects to a different screen position...
    const after = camera.docToScreen(doc, 800, 600);
    expect(after).not.toEqual(before);
    // ...but converting that new screen position back still recovers the
    // same document point -- pan never distorts the screen<->document
    // relationship, it only translates it.
    expect(camera.screenToDoc(after.x, after.y, 800, 600)).toEqual(doc);
  });

  it("screen -> document conversion remains stable under zoom", () => {
    const camera = createCartesianCamera();
    const doc = { x: 5, y: -8 };
    camera.zoomAt(400, 300, 2, 800, 600, 0.05, 8);
    const screen = camera.docToScreen(doc, 800, 600);
    expect(camera.screenToDoc(screen.x, screen.y, 800, 600)).toEqual(doc);
  });

  it("zoomAt preserves the intended document point under the cursor", () => {
    const camera = createCartesianCamera();
    const cursor = { x: 250, y: 180 };
    const anchoredDoc = camera.screenToDoc(cursor.x, cursor.y, 800, 600);
    camera.zoomAt(cursor.x, cursor.y, 3, 800, 600, 0.05, 8);
    const stillAnchoredDoc = camera.screenToDoc(cursor.x, cursor.y, 800, 600);
    expect(stillAnchoredDoc.x).toBeCloseTo(anchoredDoc.x, 9);
    expect(stillAnchoredDoc.y).toBeCloseTo(anchoredDoc.y, 9);
  });

  it("clamps zoom to [minZoom, maxZoom]", () => {
    const camera = createCartesianCamera();
    camera.zoomAt(400, 300, 1000, 800, 600, 0.05, 8);
    expect(camera.getState().zoom).toBe(8);
    camera.zoomAt(400, 300, 0.0001, 800, 600, 0.05, 8);
    expect(camera.getState().zoom).toBe(0.05);
  });

  it("fitToRect centers and scales a document rect to fill the viewport within padding", () => {
    const camera = createCartesianCamera();
    camera.fitToRect({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 800, 600, 0.8, 0.05, 8);
    const state = camera.getState();
    expect(state.zoom).toBeCloseTo(600 / 100 * 0.8, 9);
    expect(state.panX).toBeCloseTo(-50, 9);
    expect(state.panY).toBeCloseTo(-50, 9);
  });

  it("reset returns to the identity view", () => {
    const camera = createCartesianCamera();
    camera.panBy(100, 100);
    camera.zoomAt(0, 0, 2, 800, 600, 0.05, 8);
    camera.reset();
    expect(camera.getState()).toEqual({ panX: 0, panY: 0, zoom: 1 });
  });
});
