import { describe, expect, it, vi } from "vitest";
import { classifyGoogleAuthPopupError, performHostedGoogleCredentialRequest } from "./hostedGoogleAuth";

/**
 * HOST-03B -- the orchestration/classification logic for HOME's hosted
 * Google-credential transport, kept separate from `homeRuntime.ts`'s own
 * DOM/Firebase adapter so it's unit testable without a browser or a real
 * Firebase Auth instance. Covers: successful handoff, stale-identity
 * rejection (before AND after the popup), and explicit error
 * classification for every named failure mode -- never a silent fallback.
 */
describe("classifyGoogleAuthPopupError", () => {
  it.each([
    ["auth/popup-blocked", "popup_blocked"],
    ["auth/popup-closed-by-user", "popup_closed"],
    ["auth/cancelled-popup-request", "popup_closed"],
    ["auth/network-request-failed", "auth_error"],
    ["auth/invalid-credential", "auth_error"],
  ] as const)("maps Firebase error code %s to %s", (code, reason) => {
    expect(classifyGoogleAuthPopupError(Object.assign(new Error("x"), { code }))).toBe(reason);
  });
  it("maps the credential-extraction failure distinctly", () => {
    expect(classifyGoogleAuthPopupError(new Error("google_credential_missing"))).toBe("credential_missing");
  });
  it("falls back to auth_error for an unrecognized/non-Firebase throw", () => {
    expect(classifyGoogleAuthPopupError("not an error object")).toBe("auth_error");
    expect(classifyGoogleAuthPopupError(new Error("boom"))).toBe("auth_error");
  });
});

describe("performHostedGoogleCredentialRequest", () => {
  it("succeeds when the caller is active before and after the popup", async () => {
    const isActiveCaller = vi.fn(() => true);
    const signInWithGooglePopup = vi.fn(async () => ({ providerId: "google.com" }));
    const result = await performHostedGoogleCredentialRequest({ isActiveCaller, signInWithGooglePopup });
    expect(result).toEqual({ ok: true, credential: { providerId: "google.com" } });
    expect(isActiveCaller).toHaveBeenCalledTimes(2);
  });

  it("rejects with stale_identity WITHOUT ever opening the popup when the caller is already stale", async () => {
    const signInWithGooglePopup = vi.fn(async () => ({ providerId: "google.com" }));
    const result = await performHostedGoogleCredentialRequest({ isActiveCaller: () => false, signInWithGooglePopup });
    expect(result).toEqual({ ok: false, reason: "stale_identity" });
    expect(signInWithGooglePopup).not.toHaveBeenCalled();
  });

  it("rejects with surface_left when the caller's navigation moved on WHILE the popup was open, even though the popup itself succeeded", async () => {
    let calls = 0;
    const isActiveCaller = () => { calls += 1; return calls === 1; }; // active before, stale after
    const signInWithGooglePopup = vi.fn(async () => ({ providerId: "google.com" }));
    const result = await performHostedGoogleCredentialRequest({ isActiveCaller, signInWithGooglePopup });
    expect(result).toEqual({ ok: false, reason: "surface_left" });
  });

  it("classifies a thrown popup error instead of letting it propagate -- never a silent fallback, always an explicit reason", async () => {
    const signInWithGooglePopup = vi.fn(async () => { throw Object.assign(new Error("blocked"), { code: "auth/popup-blocked" }); });
    const result = await performHostedGoogleCredentialRequest({ isActiveCaller: () => true, signInWithGooglePopup });
    expect(result).toEqual({ ok: false, reason: "popup_blocked", message: "blocked" });
  });

  it("classifies a missing credential distinctly from a generic auth error", async () => {
    const signInWithGooglePopup = vi.fn(async () => { throw new Error("google_credential_missing"); });
    const result = await performHostedGoogleCredentialRequest({ isActiveCaller: () => true, signInWithGooglePopup });
    expect(result).toEqual({ ok: false, reason: "credential_missing", message: "google_credential_missing" });
  });
});
