import { describe, expect, it, vi } from "vitest";
import { createHomeRadioSessionManager } from "./homeRadioSession";
import type { RadioChannelReceiver, RadioChannelReceiverListener, RadioChannelReceiverState } from "../logic/radio/createRadioChannelReceiver";

/**
 * RADIO-01 -- the manager owns exactly one persistent RADIO session
 * (engine/controller identity), lazily constructed, reused verbatim across
 * every later `acquire()` call (every hosted surface swap, in practice).
 * Covers the exact required checkpoint invariants at the pure-logic level,
 * independent of a real engine, Firebase Auth, or Firestore: one owner
 * across repeated swaps, no duplicate construction, listener handoff
 * (old surface's listener stops receiving updates once a new one
 * subscribes), and that every handle's control methods forward to the
 * SAME underlying instance.
 */
function fakeReceiver(): RadioChannelReceiver & { readonly listeners: Set<RadioChannelReceiverListener> } {
  const listeners = new Set<RadioChannelReceiverListener>();
  let state: RadioChannelReceiverState = { status: "off", live: false };
  return {
    listeners,
    turnOn: vi.fn(() => { state = { status: "on", live: false, nowPlaying: null }; listeners.forEach((l) => l(state)); }),
    turnOff: vi.fn(() => { state = { status: "off", live: false }; listeners.forEach((l) => l(state)); }),
    setVolume: vi.fn(),
    getVolume: vi.fn(() => 1),
    isOn: vi.fn(() => state.status === "on"),
    subscribe: vi.fn((listener: RadioChannelReceiverListener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }),
  };
}

describe("createHomeRadioSessionManager -- one persistent owner", () => {
  it("constructs the underlying receiver lazily, only once, across repeated acquire() calls", () => {
    const createReceiver = vi.fn(fakeReceiver);
    const manager = createHomeRadioSessionManager(createReceiver);
    expect(createReceiver).not.toHaveBeenCalled(); // lazy -- not constructed until first acquire()
    manager.acquire();
    manager.acquire();
    manager.acquire();
    expect(createReceiver).toHaveBeenCalledOnce(); // "hosted RADIO ON creates one persistent owner" / "repeated surface swaps retain same owner"
  });

  it("MAP -> BLACKBOOK -> MAP (repeated swaps): every handle's control methods forward to the SAME underlying instance", () => {
    const underlying = fakeReceiver();
    const manager = createHomeRadioSessionManager(() => underlying);
    const mapHandle = manager.acquire();
    mapHandle.turnOn();
    expect(underlying.turnOn).toHaveBeenCalledOnce();

    const blackbookHandle = manager.acquire(); // simulates the next surface's own bootstrap re-acquiring
    expect(blackbookHandle.isOn()).toBe(true); // still ON -- the swap never destroyed/recreated the engine
    expect(underlying.isOn).toHaveBeenCalled();

    const mapHandleAgain = manager.acquire();
    expect(mapHandleAgain.isOn()).toBe(true);
    expect(underlying.turnOn).toHaveBeenCalledOnce(); // never called a second time by the swaps themselves
  });

  it("a later surface's subscribe() replaces the earlier surface's listener -- the old one stops receiving updates", () => {
    const underlying = fakeReceiver();
    const manager = createHomeRadioSessionManager(() => underlying);
    const mapStates: RadioChannelReceiverState[] = [];
    const blackbookStates: RadioChannelReceiverState[] = [];

    manager.acquire().subscribe((s) => mapStates.push(s));
    expect(underlying.listeners.size).toBe(1);

    manager.acquire().subscribe((s) => blackbookStates.push(s));
    expect(underlying.listeners.size).toBe(1); // never two live listeners for one mounted surface at a time

    underlying.turnOn();
    expect(blackbookStates.at(-1)).toMatchObject({ status: "on" });
    expect(mapStates.length).toBe(1); // MAP's own listener only ever got its initial replay, nothing after BLACKBOOK took over
  });

  it("the SAME mount's own handle supports more than one live listener at once (e.g. the bootstrap's window.SBE mirror AND the surface's own UI render both subscribed)", () => {
    const underlying = fakeReceiver();
    const manager = createHomeRadioSessionManager(() => underlying);
    const handle = manager.acquire();
    const mirrorStates: RadioChannelReceiverState[] = [];
    const renderStates: RadioChannelReceiverState[] = [];
    handle.subscribe((s) => mirrorStates.push(s));
    handle.subscribe((s) => renderStates.push(s));
    expect(underlying.listeners.size).toBe(2); // both survive -- subscribing a second listener on the SAME mount must never evict the first

    underlying.turnOn();
    expect(mirrorStates.at(-1)).toMatchObject({ status: "on" });
    expect(renderStates.at(-1)).toMatchObject({ status: "on" }); // both still receiving updates
  });

  it("child readiness/remount does not imply OFF -- a fresh handle observes whatever state the session was already in", () => {
    const underlying = fakeReceiver();
    const manager = createHomeRadioSessionManager(() => underlying);
    manager.acquire().turnOn();
    const seen: RadioChannelReceiverState[] = [];
    manager.acquire().subscribe((s) => seen.push(s));
    expect(seen[0]).toMatchObject({ status: "on" }); // never reset to "off" merely because a new surface just mounted
  });

  it("explicit OFF genuinely stops the session, observable from any handle", () => {
    const underlying = fakeReceiver();
    const manager = createHomeRadioSessionManager(() => underlying);
    const a = manager.acquire();
    a.turnOn();
    const b = manager.acquire();
    b.turnOff();
    expect(underlying.turnOff).toHaveBeenCalledOnce();
    expect(manager.acquire().isOn()).toBe(false);
  });

  it("volume control forwards to the same underlying instance regardless of which handle called it", () => {
    const underlying = fakeReceiver();
    const manager = createHomeRadioSessionManager(() => underlying);
    manager.acquire().setVolume(0.4);
    manager.acquire().setVolume(0.7); // a later surface's own volume change
    expect(underlying.setVolume).toHaveBeenNthCalledWith(1, 0.4);
    expect(underlying.setVolume).toHaveBeenNthCalledWith(2, 0.7);
  });
});
