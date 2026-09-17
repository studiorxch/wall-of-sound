import { describe, expect, it } from "vitest";
import {
  normalizePointerSample,
  resolvePencilCoverage,
  resolvePencilSprayAngle,
  type PointerEventLike,
} from "./PencilInput";

function pencilEvent(overrides: Partial<PointerEventLike> = {}): PointerEventLike {
  return {
    pointerType: "pen",
    pressure: 0.6,
    tiltX: 20,
    tiltY: -10,
    twist: 45,
    clientX: 100,
    clientY: 100,
    timeStamp: 1000,
    ...overrides,
  };
}

describe("normalizePointerSample -- reads actual PointerEvent values, never guesses", () => {
  it("captures pointerType, pressure, tiltX, tiltY, twist verbatim from a pen event", () => {
    const sample = normalizePointerSample(pencilEvent(), null);
    expect(sample.pointerType).toBe("pen");
    expect(sample.pressure).toBe(0.6);
    expect(sample.tiltX).toBe(20);
    expect(sample.tiltY).toBe(-10);
    expect(sample.twist).toBe(45);
    expect(sample.isPencil).toBe(true);
    expect(sample.isTouch).toBe(false);
  });

  it("falls back to the Pointer Events spec's own defaults when a field is missing, never fabricating a plausible-looking value", () => {
    const event = pencilEvent();
    // @ts-expect-error -- simulating a real device that omits these fields entirely
    delete event.pressure;
    // @ts-expect-error
    delete event.tiltX;
    // @ts-expect-error
    delete event.tiltY;
    // @ts-expect-error
    delete event.twist;
    const sample = normalizePointerSample(event, null);
    expect(sample.pressure).toBe(0.5); // spec default while in contact
    expect(sample.tiltX).toBe(0);
    expect(sample.tiltY).toBe(0);
    expect(sample.twist).toBe(0);
  });

  it("distinguishes pen, touch, and mouse via pointerType (section F: finger and Pencil can be distinguished)", () => {
    expect(normalizePointerSample(pencilEvent({ pointerType: "pen" }), null).isPencil).toBe(true);
    const touch = normalizePointerSample(pencilEvent({ pointerType: "touch" }), null);
    expect(touch.isPencil).toBe(false);
    expect(touch.isTouch).toBe(true);
    const mouse = normalizePointerSample(pencilEvent({ pointerType: "mouse" }), null);
    expect(mouse.isPencil).toBe(false);
    expect(mouse.isTouch).toBe(false);
  });

  it("computes velocity from consecutive samples, 0 for the first sample of a sequence", () => {
    const first = normalizePointerSample(pencilEvent({ clientX: 0, clientY: 0, timeStamp: 0 }), null);
    expect(first.velocity).toBe(0);
    const second = normalizePointerSample(
      pencilEvent({ clientX: 30, clientY: 40, timeStamp: 100 }),
      first,
    );
    expect(second.velocity).toBeCloseTo(50 / 100, 6); // hypot(30,40)=50 over 100ms
  });

  it("counts coalesced events when the browser exposes getCoalescedEvents, 0 when it doesn't", () => {
    const withCoalesced = normalizePointerSample(
      pencilEvent({ getCoalescedEvents: () => [{ clientX: 1, clientY: 1 }, { clientX: 2, clientY: 2 }, { clientX: 3, clientY: 3 }] }),
      null,
    );
    expect(withCoalesced.coalescedCount).toBe(3);
    const withoutCoalesced = normalizePointerSample(pencilEvent({ getCoalescedEvents: undefined }), null);
    expect(withoutCoalesced.coalescedCount).toBe(0);
  });
});

describe("pen vs mouse routing", () => {
  it("a mouse event never reads as Pencil, regardless of pressure/tilt values happening to be present", () => {
    const sample = normalizePointerSample(pencilEvent({ pointerType: "mouse", pressure: 0.9, tiltX: 45 }), null);
    expect(sample.isPencil).toBe(false);
    expect(sample.pointerType).toBe("mouse");
  });
});

describe("pressure stays distinct from distance -- Pencil Mapping V1 (section E)", () => {
  it("resolvePencilCoverage is a pure function of pressure alone, with no distance/baseRadius parameter to even accept", () => {
    expect(resolvePencilCoverage.length).toBe(1); // single-argument signature -- structurally cannot read distance
    expect(resolvePencilCoverage(0)).toBeCloseTo(0.35, 6);
    expect(resolvePencilCoverage(1)).toBeCloseTo(1, 6);
    expect(resolvePencilCoverage(0.5)).toBeGreaterThan(resolvePencilCoverage(0.2));
  });

  it("resolvePencilSprayAngle depends only on tilt, never on pressure or distance", () => {
    expect(resolvePencilSprayAngle.length).toBe(3); // tiltX, tiltY, maxAngleDegrees -- no pressure/distance parameter
    expect(resolvePencilSprayAngle(0, 0, 60)).toBe(0);
    expect(resolvePencilSprayAngle(90, 0, 60)).toBeCloseTo(60, 6);
    expect(resolvePencilSprayAngle(45, 0, 60)).toBeGreaterThan(0);
    expect(resolvePencilSprayAngle(45, 0, 60)).toBeLessThan(60);
  });

  it("tilt mapping is bounded to the supplied max angle even for an extreme tilt beyond the nominal +/-90 range", () => {
    expect(resolvePencilSprayAngle(200, 200, 60)).toBeCloseTo(60, 6);
  });
});
