import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RADIO-01 -- `radioChannelReceiverRuntime.ts` is the ONE shared bootstrap
 * script both MAP and BLACKBOOK load. It has module-top-level side effects
 * (reads `window`/`location`/`document` immediately on import, exactly
 * like a real `<script type="module">` bootstrap would), so each case
 * stubs globals and mocks the underlying engine factory BEFORE a fresh
 * dynamic import, via `vi.resetModules()`. Fake timers flush the script's
 * own bounded retry loop (it waits for HOME's readiness handshake to
 * finish before its first `getRadioSession()` attempt would otherwise
 * always be rejected as "not active yet").
 *
 * Covers the exact required checkpoint invariants: standalone is
 * unaffected; a hosted document with a valid session NEVER constructs a
 * local engine; a hosted document whose session request is rejected
 * (stale/wrong runtime) fails explicitly and ALSO never constructs a
 * local engine -- no silent fallback to a competing, duplicate playback
 * owner either way.
 */
const createRadioChannelReceiver = vi.fn(() => ({
  turnOn: vi.fn(), turnOff: vi.fn(), setVolume: vi.fn(), getVolume: vi.fn(() => 1), isOn: vi.fn(() => false),
  subscribe: vi.fn((listener: (state: unknown) => void) => { listener({ status: "off", live: false }); return () => {}; }),
}));
const createFailedRadioChannelReceiver = vi.fn((reason: string) => ({
  turnOn: vi.fn(), turnOff: vi.fn(), setVolume: vi.fn(), getVolume: vi.fn(() => 1), isOn: vi.fn(() => false),
  subscribe: vi.fn((listener: (state: unknown) => void) => { listener({ status: "off", live: false }); return () => {}; }),
  __failedReason: reason,
}));

vi.mock("../logic/radio/createRadioChannelReceiver", () => ({ createRadioChannelReceiver, createFailedRadioChannelReceiver }));

function stubEnvironment(search: string, parentHost?: unknown) {
  vi.stubGlobal("location", { search, origin: "http://local" } as unknown as Location);
  vi.stubGlobal("document", { documentElement: { dataset: {} } } as unknown as Document);
  const win = {
    parent: undefined,
    setInterval: vi.fn(),
    setTimeout: ((fn: () => void, ms?: number) => setTimeout(fn, ms)) as typeof setTimeout,
    SBE: undefined,
  } as unknown as Window & typeof globalThis;
  win.parent = parentHost === undefined ? win : ({ location: { origin: "http://local" }, StudioRichHome: parentHost } as unknown as Window);
  vi.stubGlobal("window", win);
  return win;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  createRadioChannelReceiver.mockClear();
  createFailedRadioChannelReceiver.mockClear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("radioChannelReceiverRuntime -- standalone/embedded is unaffected", () => {
  it("no parent frame at all: constructs the local engine directly", async () => {
    const win = stubEnvironment("");
    await import("./radioChannelReceiverRuntime");
    await vi.runAllTimersAsync();
    expect(createRadioChannelReceiver).toHaveBeenCalledOnce();
    expect(createFailedRadioChannelReceiver).not.toHaveBeenCalled();
    expect((win as any).SBE.RadioChannelReceiver).toBeDefined();
  });

  it("embedded in a non-HOME parent (no StudioRichHome): constructs the local engine directly", async () => {
    stubEnvironment("", {});
    await import("./radioChannelReceiverRuntime");
    await vi.runAllTimersAsync();
    expect(createRadioChannelReceiver).toHaveBeenCalledOnce();
    expect(createFailedRadioChannelReceiver).not.toHaveBeenCalled();
  });

  it.each(["?host=home", "?host=home&homeRuntime=s&homeNavigation=0", "?host=home&homeRuntime=s&homeNavigation=NaN"])(
    "rejects incomplete hosted identity %s -- falls to the local engine, same as standalone",
    async (search) => {
      stubEnvironment(search, { version: 1, getRadioSession: vi.fn() });
      await import("./radioChannelReceiverRuntime");
      await vi.runAllTimersAsync();
      expect(createRadioChannelReceiver).toHaveBeenCalledOnce();
    },
  );
});

describe("radioChannelReceiverRuntime -- hosted", () => {
  it("valid hosted mount with a granted session: uses HOME's session, NEVER constructs a local engine", async () => {
    const homeSession = { turnOn: vi.fn(), turnOff: vi.fn(), setVolume: vi.fn(), getVolume: vi.fn(() => 1), isOn: vi.fn(() => false), subscribe: vi.fn((l: any) => { l({ status: "off", live: false }); return () => {}; }) };
    const getRadioSession = vi.fn(() => homeSession);
    const win = stubEnvironment("?host=home&homeRuntime=session&homeNavigation=4", { version: 1, getRadioSession });
    await import("./radioChannelReceiverRuntime");
    await vi.runAllTimersAsync();
    expect(getRadioSession).toHaveBeenCalledExactlyOnceWith(document, { runtimeId: "session", navigationId: 4 });
    expect((win as any).SBE.RadioChannelReceiver).toBe(homeSession);
    expect(createRadioChannelReceiver).not.toHaveBeenCalled();
    expect(createFailedRadioChannelReceiver).not.toHaveBeenCalled();
  });

  it("HOME not active yet on the first attempt (getRadioSession initially null, then granted): retries instead of failing immediately", async () => {
    const homeSession = { turnOn: vi.fn(), turnOff: vi.fn(), setVolume: vi.fn(), getVolume: vi.fn(() => 1), isOn: vi.fn(() => false), subscribe: vi.fn((l: any) => { l({ status: "off", live: false }); return () => {}; }) };
    let calls = 0;
    const getRadioSession = vi.fn(() => { calls += 1; return calls < 4 ? null : homeSession; });
    const win = stubEnvironment("?host=home&homeRuntime=session&homeNavigation=4", { version: 1, getRadioSession });
    await import("./radioChannelReceiverRuntime");
    await vi.runAllTimersAsync();
    expect(getRadioSession).toHaveBeenCalledTimes(4);
    expect((win as any).SBE.RadioChannelReceiver).toBe(homeSession);
    expect(createRadioChannelReceiver).not.toHaveBeenCalled();
    expect(createFailedRadioChannelReceiver).not.toHaveBeenCalled();
  });

  it("stale/rejected hosted mount (getRadioSession never grants): fails explicitly after the retry budget, NEVER falls back to a local engine", async () => {
    const getRadioSession = vi.fn(() => null);
    stubEnvironment("?host=home&homeRuntime=session&homeNavigation=4", { version: 1, getRadioSession });
    await import("./radioChannelReceiverRuntime");
    await vi.runAllTimersAsync();
    expect(getRadioSession).toHaveBeenCalledTimes(100);
    expect(createFailedRadioChannelReceiver).toHaveBeenCalledExactlyOnceWith("stale_identity");
    expect(createRadioChannelReceiver).not.toHaveBeenCalled(); // the one invariant this checkpoint exists to guarantee: no duplicate/competing engine
  });

  it("a wrong-version StudioRichHome is treated as not-hosted, not as a rejected session", async () => {
    const getRadioSession = vi.fn();
    stubEnvironment("?host=home&homeRuntime=session&homeNavigation=4", { version: 2, getRadioSession });
    await import("./radioChannelReceiverRuntime");
    await vi.runAllTimersAsync();
    expect(getRadioSession).not.toHaveBeenCalled();
    expect(createRadioChannelReceiver).toHaveBeenCalledOnce();
  });
});
