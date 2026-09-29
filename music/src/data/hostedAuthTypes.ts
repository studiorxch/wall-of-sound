/**
 * HOST-03B -- the result envelope for HOME's hosted Google-credential
 * transport (`HomeSurfaceHost.requestGoogleCredential`). `credential` is
 * treated as opaque by everything except the requesting surface's own
 * `MemberIdentityAuthority.signInWithCredential` -- HOME never inspects it,
 * never persists it, never becomes a second source of member state.
 */
export type HostedGoogleCredentialFailureReason =
  | "home_unavailable"
  | "stale_identity"
  | "popup_blocked"
  | "popup_closed"
  | "credential_missing"
  | "auth_error"
  | "surface_left";

export type HostedGoogleCredentialResult =
  | { readonly ok: true; readonly credential: unknown }
  | { readonly ok: false; readonly reason: HostedGoogleCredentialFailureReason; readonly message?: string };
