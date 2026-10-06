import { describe, expect, it } from "vitest";
import { computeMemberGatedControlsState } from "./memberGatedControls";

describe("BLACKBOOK Presentation Readiness -- computeMemberGatedControlsState", () => {
  it("signed out: every sign-in-gated control is disabled, regardless of operations/clear-snapshot state", () => {
    const state = computeMemberGatedControlsState({
      signedIn: false,
      hasOperations: true,
      hasPendingClearSnapshot: true,
    });
    expect(state).toEqual({
      undoDisabled: true,
      clearDisabled: true,
      newDisabled: true,
      pagesNewDisabled: true,
    });
  });

  it("signed in, no operations, no pending clear snapshot: NEW/PAGES-+ enabled, UNDO/CLEAR disabled (nothing to undo/clear)", () => {
    const state = computeMemberGatedControlsState({
      signedIn: true,
      hasOperations: false,
      hasPendingClearSnapshot: false,
    });
    expect(state).toEqual({
      undoDisabled: true,
      clearDisabled: true,
      newDisabled: false,
      pagesNewDisabled: false,
    });
  });

  it("signed in, no operations, but a pending clear snapshot (just pressed CLEAR): UNDO stays enabled, CLEAR disabled, NEW/PAGES-+ enabled", () => {
    const state = computeMemberGatedControlsState({
      signedIn: true,
      hasOperations: false,
      hasPendingClearSnapshot: true,
    });
    expect(state).toEqual({
      undoDisabled: false,
      clearDisabled: true,
      newDisabled: false,
      pagesNewDisabled: false,
    });
  });

  it("signed in with operations: every control enabled", () => {
    const state = computeMemberGatedControlsState({
      signedIn: true,
      hasOperations: true,
      hasPendingClearSnapshot: false,
    });
    expect(state).toEqual({
      undoDisabled: false,
      clearDisabled: false,
      newDisabled: false,
      pagesNewDisabled: false,
    });
  });

  it("state transition: signing in re-enables NEW/PAGES-+ from a signed-out baseline", () => {
    const signedOut = computeMemberGatedControlsState({
      signedIn: false,
      hasOperations: false,
      hasPendingClearSnapshot: false,
    });
    const signedIn = computeMemberGatedControlsState({
      signedIn: true,
      hasOperations: false,
      hasPendingClearSnapshot: false,
    });
    expect(signedOut.newDisabled).toBe(true);
    expect(signedOut.pagesNewDisabled).toBe(true);
    expect(signedIn.newDisabled).toBe(false);
    expect(signedIn.pagesNewDisabled).toBe(false);
  });

  it("state transition: signing back out re-disables NEW/PAGES-+ from a signed-in, populated baseline", () => {
    const signedIn = computeMemberGatedControlsState({
      signedIn: true,
      hasOperations: true,
      hasPendingClearSnapshot: false,
    });
    const signedOutAgain = computeMemberGatedControlsState({
      signedIn: false,
      hasOperations: true,
      hasPendingClearSnapshot: false,
    });
    expect(signedIn.newDisabled).toBe(false);
    expect(signedIn.pagesNewDisabled).toBe(false);
    expect(signedOutAgain.newDisabled).toBe(true);
    expect(signedOutAgain.pagesNewDisabled).toBe(true);
  });

  it("is pure -- same input always produces an equal, freshly-computed result", () => {
    const input = { signedIn: true, hasOperations: true, hasPendingClearSnapshot: false };
    expect(computeMemberGatedControlsState(input)).toEqual(computeMemberGatedControlsState(input));
  });
});
