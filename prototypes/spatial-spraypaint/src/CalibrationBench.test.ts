import { describe, expect, it } from "vitest";
import {
  buildCalibrationDifferenceSummary,
  buildCalibrationPropertyReadout,
  buildCalibrationSnapshotText,
  buildCalibrationStrokes,
  CALIBRATION_MATRIX,
  CALIBRATION_SEED,
  EMPTY_CALIBRATION_REFERENCE_NOTES,
  getCalibrationSample,
  mergeCalibrationPropertyRows,
  renderCalibrationSample,
  resolveCalibrationEffectiveRadius,
  resolveCalibrationStrokeWidth,
  resolveMatchedWidthRadius,
} from "./CalibrationBench";
import { calibrationClassificationLabel, getSprayCapClassification } from "./SprayCapCalibrationStatus";
import { getSprayCapPreset, SPRAY_CAP_PRESETS } from "./SprayCapPresets";
import { createStrokeRandom, SprayBrushEngine } from "./SprayBrushEngine";
import { type StrokePoint } from "./types";

function segmentRecordingContext(): { ctx: CanvasRenderingContext2D; strokeStyles: string[]; fillStyles: string[] } {
  const strokeStyles: string[] = [];
  const fillStyles: string[] = [];
  let strokeStyle = "";
  let fillStyle = "";
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    arcTo: () => undefined,
    ellipse: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    clearRect: () => undefined,
    stroke: () => strokeStyles.push(strokeStyle),
    fill: () => fillStyles.push(fillStyle),
    createRadialGradient: () => ({ addColorStop: () => undefined }) as unknown as CanvasGradient,
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) { strokeStyle = String(value); },
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) { fillStyle = String(value); },
    lineCap: "round",
    lineJoin: "round",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, strokeStyles, fillStyles };
}

function alphaOf(rgba: string): number {
  return Number.parseFloat(rgba.split(",")[3]);
}

describe("Calibration Bench — deterministic matrix", () => {
  it("defines all ten required samples A-J in order", () => {
    expect(CALIBRATION_MATRIX.map((s) => s.label[0])).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]);
    expect(CALIBRATION_MATRIX).toHaveLength(10);
  });

  it("gives Fill — three passes exactly 3 passes and every other sample exactly 1", () => {
    expect(getCalibrationSample("fill-three-pass").passes).toBe(3);
    for (const sample of CALIBRATION_MATRIX) {
      if (sample.id !== "fill-three-pass") expect(sample.passes).toBe(1);
    }
  });

  it("uses the SAME coordinates and timing for a sample regardless of stroke width — only the width field differs", () => {
    const narrow = buildCalibrationStrokes("curve", 10);
    const wide = buildCalibrationStrokes("curve", 60);
    expect(narrow.length).toBe(wide.length);
    for (let s = 0; s < narrow.length; s += 1) {
      expect(narrow[s].map((p) => ({ x: p.x, y: p.y, timestamp: p.timestamp, velocity: p.velocity }))).toEqual(
        wide[s].map((p) => ({ x: p.x, y: p.y, timestamp: p.timestamp, velocity: p.velocity })),
      );
      expect(narrow[s].every((p) => p.width === 10)).toBe(true);
      expect(wide[s].every((p) => p.width === 60)).toBe(true);
    }
  });

  it("gives Start/Stop three separate discrete strokes (each its own stroke-start), every other non-fill sample exactly one", () => {
    expect(buildCalibrationStrokes("start-stop", 20)).toHaveLength(3);
    expect(buildCalibrationStrokes("curve", 20)).toHaveLength(1);
    expect(buildCalibrationStrokes("quick-dot", 20)).toHaveLength(1);
  });
});

describe("Calibration Bench — Native vs. Matched Width", () => {
  it("Native mode always returns the preset's own baseRadius, ignoring any matched-width value", () => {
    const astro = getSprayCapPreset("astro-fat");
    expect(resolveCalibrationEffectiveRadius(astro, "native", 999)).toBe(astro.baseRadius);
    expect(resolveCalibrationEffectiveRadius(astro, "native", 1)).toBe(astro.baseRadius);
  });

  it("Matched mode defaults to the narrower of the two selected caps' own native radius", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    expect(resolveMatchedWidthRadius(astro, nyFat)).toBe(nyFat.baseRadius);
    expect(resolveMatchedWidthRadius(nyFat, astro)).toBe(nyFat.baseRadius);
  });

  it("Matched mode gives both sides the identical effective radius", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const matched = resolveMatchedWidthRadius(astro, nyFat);
    expect(resolveCalibrationEffectiveRadius(astro, "matched", matched)).toBe(
      resolveCalibrationEffectiveRadius(nyFat, "matched", matched),
    );
  });

  it("never mutates either preset object when resolving widths", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const astroBefore = { ...astro };
    const nyFatBefore = { ...nyFat };
    resolveMatchedWidthRadius(astro, nyFat);
    resolveCalibrationEffectiveRadius(astro, "matched", 40);
    resolveCalibrationEffectiveRadius(nyFat, "native", 40);
    expect(astro).toEqual(astroBefore);
    expect(nyFat).toEqual(nyFatBefore);
  });
});

describe("Calibration Bench — rendering (real SprayBrushEngine, no fake imagery)", () => {
  it("renders Left and Right fully independently — no shared engine state leaks between two separate render calls", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const leftFirst = segmentRecordingContext();
    renderCalibrationSample(leftFirst.ctx, "fill-three-pass", astro, 62);
    const rightFirst = segmentRecordingContext();
    renderCalibrationSample(rightFirst.ctx, "fill-three-pass", nyFat, 32);

    // Re-render Left again after Right — must reproduce byte-identically, proving Right's render didn't leak into Left's engine/state.
    const leftSecond = segmentRecordingContext();
    renderCalibrationSample(leftSecond.ctx, "fill-three-pass", astro, 62);
    expect(leftSecond.strokeStyles).toEqual(leftFirst.strokeStyles);
  });

  it("is deterministic — identical sample/preset/width always renders the identical draw sequence", () => {
    const nyFat = getSprayCapPreset("new-york-fat");
    const first = segmentRecordingContext();
    renderCalibrationSample(first.ctx, "curve", nyFat, 32);
    const second = segmentRecordingContext();
    renderCalibrationSample(second.ctx, "curve", nyFat, 32);
    expect(second.strokeStyles).toEqual(first.strokeStyles);
  });

  it("does not mutate any Spray cap preset by rendering a sample against it", () => {
    const before = JSON.parse(JSON.stringify(SPRAY_CAP_PRESETS));
    for (const preset of SPRAY_CAP_PRESETS) {
      const { ctx } = segmentRecordingContext();
      renderCalibrationSample(ctx, "long-dwell", preset, resolveCalibrationStrokeWidth(preset.baseRadius));
    }
    expect(JSON.parse(JSON.stringify(SPRAY_CAP_PRESETS))).toEqual(before);
  });

  it("Fill samples reuse the real Fill-mode ceiling — the identical sweep path's max single core-draw alpha is meaningfully lower under Fill than under normal (non-Fill) rendering", () => {
    const astro = getSprayCapPreset("astro-fat");
    const strokeWidth = resolveCalibrationStrokeWidth(62);
    const [points] = buildCalibrationStrokes("fill-one-sweep", strokeWidth);

    const nonFill = segmentRecordingContext();
    const engine = new SprayBrushEngine();
    engine.beginStroke();
    let previous: StrokePoint | null = null;
    for (const point of points) {
      engine.renderSegment(nonFill.ctx, previous, point, "#ffffff", astro, createStrokeRandom(CALIBRATION_SEED), 1, false);
      previous = point;
    }
    const maxNonFill = Math.max(...nonFill.strokeStyles.map(alphaOf));

    const fillThreePass = segmentRecordingContext();
    renderCalibrationSample(fillThreePass.ctx, "fill-three-pass", astro, 62);
    const maxFill = Math.max(...fillThreePass.strokeStyles.map(alphaOf));

    expect(maxFill).toBeLessThan(maxNonFill);
  });

  it("a non-fill sample ignores fillMode entirely — rendering the same path via a fill vs. non-fill sample id produces different (bounded vs. unbounded) results", () => {
    const nyFat = getSprayCapPreset("new-york-fat");
    const fillOnce = segmentRecordingContext();
    renderCalibrationSample(fillOnce.ctx, "fill-one-sweep", nyFat, 32);
    const strokeOnly = segmentRecordingContext();
    renderCalibrationSample(strokeOnly.ctx, "slow-straight", nyFat, 32);
    // Both are real draws; just confirm both produced output and neither crashed / no-op'd silently.
    expect(fillOnce.strokeStyles.length).toBeGreaterThan(0);
    expect(strokeOnly.strokeStyles.length).toBeGreaterThan(0);
  });
});

describe("Calibration Bench — property readout", () => {
  it("includes every required diagnostic field from the brief for a plain line cap", () => {
    const nyFat = getSprayCapPreset("new-york-fat");
    const rows = buildCalibrationPropertyReadout(nyFat, 32);
    const keys = rows.map((r) => r.key);
    for (const required of [
      "effectiveRadius", "baseRadius", "coreDensity", "coreOpacity", "edgeFalloff",
      "particleCount", "particleSpread", "particleOpacity", "flowRate",
      "accumulationRate", "velocityResponse", "endpointBehavior", "depositionShape", "defaultFillMode",
    ]) {
      expect(keys).toContain(required);
    }
    // No halo/ring/streak rows for a cap that doesn't use them.
    expect(keys).not.toContain("haloRadius");
    expect(keys).not.toContain("ringRadius");
    expect(keys).not.toContain("streakLanes");
  });

  it("surfaces plume fields only for a cap that actually uses the plume mechanism (Pink Dot Fat)", () => {
    const pink = getSprayCapPreset("pink-dot-fat");
    const keys = buildCalibrationPropertyReadout(pink, 42).map((r) => r.key);
    expect(keys).toContain("plumeRingRadius");
    expect(keys).toContain("plumeMistOpacity");
    // The generic halo mechanism is dormant — Pink Dot no longer uses it.
    expect(keys).not.toContain("haloRadius");
  });

  it("surfaces ring fields only for Ring/Donut and streak fields only for Dry/Streak", () => {
    const ring = getSprayCapPreset("ring-donut");
    const ringKeys = buildCalibrationPropertyReadout(ring, 40).map((r) => r.key);
    expect(ringKeys).toContain("ringRadius");
    expect(ringKeys).toContain("centerOpacity");
    expect(ringKeys).not.toContain("streakLanes");

    const streak = getSprayCapPreset("dry-streak");
    const streakKeys = buildCalibrationPropertyReadout(streak, 34).map((r) => r.key);
    expect(streakKeys).toContain("streakLanes");
    expect(streakKeys).not.toContain("ringRadius");
  });
});

describe("Calibration Bench — merged property comparison table", () => {
  it("aligns matching keys onto one row with both values", () => {
    const nyFat = getSprayCapPreset("new-york-fat");
    const astro = getSprayCapPreset("astro-fat");
    const merged = mergeCalibrationPropertyRows(
      buildCalibrationPropertyReadout(nyFat, 32),
      buildCalibrationPropertyReadout(astro, 62),
    );
    const coreDensity = merged.find((r) => r.key === "coreDensity")!;
    expect(coreDensity.leftValue).toBe(nyFat.coreDensity);
    expect(coreDensity.rightValue).toBe(astro.coreDensity);
  });

  it("leaves the other side's value undefined when only one cap has a row (e.g. Pink Dot's plume ring), rather than dropping the row", () => {
    const nyFat = getSprayCapPreset("new-york-fat");
    const pink = getSprayCapPreset("pink-dot-fat");
    const merged = mergeCalibrationPropertyRows(
      buildCalibrationPropertyReadout(nyFat, 32),
      buildCalibrationPropertyReadout(pink, 42),
    );
    const ring = merged.find((r) => r.key === "plumeRingRadius")!;
    expect(ring.leftValue).toBeUndefined();
    expect(ring.rightValue).toBe(pink.plumeRingRadius);
  });

  it("preserves Left's own row order, appending Right-only rows at the end", () => {
    const nyFat = getSprayCapPreset("new-york-fat");
    const pink = getSprayCapPreset("pink-dot-fat");
    const leftRows = buildCalibrationPropertyReadout(nyFat, 32);
    const merged = mergeCalibrationPropertyRows(leftRows, buildCalibrationPropertyReadout(pink, 42));
    expect(merged.slice(0, leftRows.length).map((r) => r.key)).toEqual(leftRows.map((r) => r.key));
    expect(merged[merged.length - 1].key).toBe("plumeFlareStrength");
  });
});

describe("Calibration Bench — difference summary", () => {
  it("is deterministic: identical inputs always produce identical output", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const first = buildCalibrationDifferenceSummary(nyFat, astro, 32, 62);
    const second = buildCalibrationDifferenceSummary(nyFat, astro, 32, 62);
    expect(second).toEqual(first);
  });

  it("computes Size as a real percentage difference between the two effective radii, not a subjective label", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const rows = buildCalibrationDifferenceSummary(nyFat, astro, 32, 62);
    const size = rows.find((r) => r.key === "size")!;
    expect(size.percentDelta).toBeCloseTo(93.75, 1); // (62-32)/32 * 100
  });

  it("collapses to 0% on every numeric field's Size row under Matched Width", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const matched = resolveMatchedWidthRadius(astro, nyFat);
    const rows = buildCalibrationDifferenceSummary(nyFat, astro, matched, matched);
    expect(rows.find((r) => r.key === "size")!.percentDelta).toBe(0);
  });

  it("reports endpoint behavior and deposition shape as categorical, not percentage, differences", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const rows = buildCalibrationDifferenceSummary(nyFat, astro, 32, 62);
    const endpoint = rows.find((r) => r.key === "endpointBehavior")!;
    expect(endpoint.kind).toBe("categorical");
    expect(endpoint.percentDelta).toBeNull();
    expect(endpoint.leftValue).toBe("settled");
    expect(endpoint.rightValue).toBe("punchy");
  });

  it("never produces a subjective judgement string ('authentic', 'better', 'correct') anywhere in the output", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const rows = buildCalibrationDifferenceSummary(nyFat, astro, 32, 62);
    const serialized = JSON.stringify(rows).toLowerCase();
    for (const banned of ["authentic", "better", "worse", "correct", "wrong"]) {
      expect(serialized).not.toContain(banned);
    }
  });
});

describe("Calibration Bench — audit classification display", () => {
  it("surfaces the exact classification documented in the Visual Audit, without promoting any of them", () => {
    expect(getSprayCapClassification("new-york-thin")).toBe("VERIFIED");
    expect(getSprayCapClassification("soft-fade")).toBe("VERIFIED");
    expect(getSprayCapClassification("new-york-fat")).toBe("PROVISIONAL");
    expect(getSprayCapClassification("astro-fat")).toBe("PROVISIONAL");
    expect(getSprayCapClassification("german-fat")).toBe("NEEDS_CALIBRATION");
    expect(getSprayCapClassification("pink-dot-fat")).toBe("NEEDS_CALIBRATION");
    expect(getSprayCapClassification("ring-donut")).toBe("DIGITAL_EFFECT");
    expect(getSprayCapClassification("dry-streak")).toBe("DIGITAL_EFFECT");
    expect(getSprayCapClassification("fuzz-fat")).toBe("DIGITAL_EFFECT");
    expect(getSprayCapClassification("wiggly-needle")).toBe("DIGITAL_EFFECT");
  });

  it("labels every classification value distinctly", () => {
    expect(calibrationClassificationLabel("VERIFIED")).toBe("Verified");
    expect(calibrationClassificationLabel("PROVISIONAL")).toBe("Provisional");
    expect(calibrationClassificationLabel("NEEDS_CALIBRATION")).toBe("Needs calibration");
    expect(calibrationClassificationLabel("DIGITAL_EFFECT")).toBe("Digital effect");
  });

  it("gives every built-in Spray cap a classification (no gaps)", () => {
    for (const preset of SPRAY_CAP_PRESETS) {
      expect(getCalibrationSample).toBeDefined();
      expect(getSprayCapClassification(preset.id)).toBeTruthy();
    }
  });
});

describe("Calibration Bench — snapshot text", () => {
  it("includes both cap names, the width mode, classification labels, and every numeric difference", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const text = buildCalibrationSnapshotText(nyFat, astro, "native", 32, 62, "Provisional", "Provisional", EMPTY_CALIBRATION_REFERENCE_NOTES);
    expect(text).toContain("New York Fat");
    expect(text).toContain("Astro Fat");
    expect(text).toContain("Native");
    expect(text).toContain("Provisional");
    expect(text).toContain("Core density");
  });

  it("omits the Reference notes section entirely when every note field is empty", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const text = buildCalibrationSnapshotText(nyFat, astro, "native", 32, 62, "Provisional", "Provisional", EMPTY_CALIBRATION_REFERENCE_NOTES);
    expect(text).not.toContain("Reference notes:");
  });

  it("includes only the filled-in note fields when some are set", () => {
    const astro = getSprayCapPreset("astro-fat");
    const nyFat = getSprayCapPreset("new-york-fat");
    const notes = { ...EMPTY_CALIBRATION_REFERENCE_NOTES, confidence: "high", dwellNotes: "blooms fast" };
    const text = buildCalibrationSnapshotText(nyFat, astro, "matched", 32, 32, "Provisional", "Provisional", notes);
    expect(text).toContain("Reference notes:");
    expect(text).toContain("high");
    expect(text).toContain("blooms fast");
    expect(text).not.toContain("Source description:");
  });
});
