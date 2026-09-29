import type { HostedGoogleCredentialFailureReason, HostedGoogleCredentialResult } from "../../data/hostedAuthTypes";

/**
 * HOST-03B -- pure classification of a thrown `signInWithGooglePopup()`
 * error into one of the explicit failure reasons the hosted transport
 * contract requires. Kept separate from `homeRuntime.ts`'s own DOM/Firebase
 * adapter so the mapping itself is unit-testable without a browser or a
 * real Firebase Auth instance.
 */
export function classifyGoogleAuthPopupError(error: unknown): HostedGoogleCredentialFailureReason {
  const code = typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
  if (code === "auth/popup-blocked") return "popup_blocked";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "popup_closed";
  if (error instanceof Error && error.message === "google_credential_missing") return "credential_missing";
  return "auth_error";
}

export interface HostedGoogleCredentialPorts {
  /** Re-checked both before opening the popup AND after it resolves -- a stale check before means a wrong/expired caller never even opens a popup; a stale check after means a credential is never handed back to a surface whose navigation moved on while the user was completing it. */
  isActiveCaller(): boolean;
  signInWithGooglePopup(): Promise<unknown>;
}

/**
 * HOST-03B -- the orchestration logic for HOME's hosted Google-credential
 * transport, kept separate from `homeRuntime.ts`'s own DOM/Firebase adapter
 * (same "logic vs. adapter" split `homeNavigation.ts` already established)
 * so the identity-gating and error-classification behavior is unit
 * testable without a browser or a real Firebase Auth instance.
 */
export async function performHostedGoogleCredentialRequest(ports: HostedGoogleCredentialPorts): Promise<HostedGoogleCredentialResult> {
  if (!ports.isActiveCaller()) return { ok: false, reason: "stale_identity" };
  try {
    const credential = await ports.signInWithGooglePopup();
    if (!ports.isActiveCaller()) return { ok: false, reason: "surface_left" };
    return { ok: true, credential };
  } catch (error) {
    return { ok: false, reason: classifyGoogleAuthPopupError(error), message: error instanceof Error ? error.message : undefined };
  }
}
