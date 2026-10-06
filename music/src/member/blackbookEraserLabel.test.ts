import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * BLACKBOOK ERASER PRESENTATION V1.
 *
 * Eraser's physical scope is graphite-only (see `materialIdForSupply` in
 * blackbookRuntime.ts), but the tool palette previously labeled it with the
 * bare word "ERASER" -- identical in form to every other tool-icon-label,
 * giving no indication that it will not affect Pen/Marker/Mop/Spray marks.
 * The fix is presentational only: the label itself now names the material
 * it erases, using the exact same plain-text tool-icon-label idiom every
 * other Art Supply button already uses (PENCIL, PEN, MARKER, MOP, SPRAY) --
 * no tooltip, warning, or new UI element was added.
 *
 * This guards that label text against silently drifting back to the
 * ambiguous bare "ERASER" wording.
 */
describe("BLACKBOOK ERASER PRESENTATION V1 -- eraser tool-icon-label", () => {
  it("names the material it erases instead of a bare, scope-ambiguous 'ERASER'", () => {
    const html = readFileSync(new URL("../../blackbook.html", import.meta.url), "utf8");
    const eraserButtonMatch = html.match(/<button id="blackbook-eraser"[^>]*>([\s\S]*?)<\/button>/);
    expect(eraserButtonMatch).not.toBeNull();
    const eraserButtonMarkup = eraserButtonMatch![1];
    const labelMatch = eraserButtonMarkup.match(/<span class="tool-icon-label">([^<]*)<\/span>/);
    expect(labelMatch).not.toBeNull();
    expect(labelMatch![1]).toBe("GRAPHITE ERASER");
  });
});
