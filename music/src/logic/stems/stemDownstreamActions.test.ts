import { describe, it, expect } from "vitest";
import { canSendToLooper, canShowInFinder, canPlaySynchronized, canReStem, BANK_UNAVAILABLE_REASON, RADIO_UNAVAILABLE_REASON } from "./stemDownstreamActions";

describe("canSendToLooper", () => {
  it("only true for current", () => {
    expect(canSendToLooper("current")).toBe(true);
    for (const l of ["outdated", "orphaned", "unavailable", "archived", undefined] as const) {
      expect(canSendToLooper(l)).toBe(false);
    }
  });
});

describe("canPlaySynchronized", () => {
  it("only true for current — archived sets are never fed through synchronized playback", () => {
    expect(canPlaySynchronized("current")).toBe(true);
    expect(canPlaySynchronized("archived")).toBe(false);
    expect(canPlaySynchronized("outdated")).toBe(false);
  });
});

describe("canShowInFinder", () => {
  it("true for any registered lifecycle except unavailable", () => {
    expect(canShowInFinder("current")).toBe(true);
    expect(canShowInFinder("archived")).toBe(true);
    expect(canShowInFinder("outdated")).toBe(true);
    expect(canShowInFinder("orphaned")).toBe(true);
    expect(canShowInFinder("unavailable")).toBe(false);
    expect(canShowInFinder(undefined)).toBe(false);
  });
});

describe("canReStem", () => {
  it("true only for outdated/orphaned/unavailable", () => {
    expect(canReStem("outdated")).toBe(true);
    expect(canReStem("orphaned")).toBe(true);
    expect(canReStem("unavailable")).toBe(true);
    expect(canReStem("current")).toBe(false);
    expect(canReStem("archived")).toBe(false);
  });
});

describe("Bank/RADIO — no builder, static disabled reasons only", () => {
  it("reasons are non-empty, honest strings — never claim more than they do", () => {
    expect(BANK_UNAVAILABLE_REASON.length).toBeGreaterThan(0);
    expect(RADIO_UNAVAILABLE_REASON.length).toBeGreaterThan(0);
  });
});
