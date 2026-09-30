import type { MemberIdentityState } from "@studiorich/member-identity";

/**
 * MEMBER-01A -- pure state->display mapping for the persistent HOME
 * avatar, same "logic vs. DOM adapter" split `homeNavigation.ts`/
 * `hostedGoogleAuth.ts` already establish for this tree. No DOM, no
 * Firebase -- a straight, fully deterministic function of
 * `MemberIdentityState`, so the three required-by-design states
 * ("initializing never falsely renders signed-out", "signed-in prefers
 * the real photo", "fallback initials without one") are covered without
 * a real DOM environment.
 */
export type MemberAvatarKind = "initializing" | "signed-out" | "signed-in";

export interface MemberAvatarDisplay {
  readonly kind: MemberAvatarKind;
  /** Non-empty provider/member photo URL, or `null` -- callers must fall back to `initials` (or a generic mark) whenever this is `null`, and must also fall back if the image itself fails to load (a broken URL is not detectable from state alone). */
  readonly photoURL: string | null;
  /** Deterministic 1-2 letter fallback derived from whatever name/email is available; `null` only when neither exists. */
  readonly initials: string | null;
  readonly displayName: string | null;
  readonly email: string | null;
}

const INITIALIZING_DISPLAY: MemberAvatarDisplay = { kind: "initializing", photoURL: null, initials: null, displayName: null, email: null };
const SIGNED_OUT_DISPLAY: MemberAvatarDisplay = { kind: "signed-out", photoURL: null, initials: null, displayName: null, email: null };

function deriveInitials(source: string | null): string | null {
  if (!source) return null;
  const trimmed = source.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  const initials = `${first}${last}`.toUpperCase();
  return initials.length > 0 ? initials : null;
}

export function deriveMemberAvatarDisplay(state: MemberIdentityState): MemberAvatarDisplay {
  if (state.status === "initializing") return INITIALIZING_DISPLAY;
  if (state.status !== "signedIn") {
    // "signedOut" and "error" both present as the same actionable
    // "offer Sign In" UI -- an unresolved error must never get stuck
    // looking like "initializing" forever, and must never fabricate a
    // signed-in identity either.
    return SIGNED_OUT_DISPLAY;
  }
  // Member's own profile fields (Firestore members/{uid}) take priority
  // over the raw provider snapshot (authUser) when both exist -- the
  // member document is the one place a display name/photo can actually
  // be edited (see updateProfile); the provider snapshot is only ever a
  // fallback for a member who hasn't set their own yet.
  const displayName = state.member.displayName ?? state.authUser.displayName;
  const rawPhotoURL = state.member.photoURL ?? state.authUser.photoURL;
  const photoURL = rawPhotoURL && rawPhotoURL.length > 0 ? rawPhotoURL : null;
  return {
    kind: "signed-in",
    photoURL,
    initials: deriveInitials(displayName ?? state.authUser.email),
    displayName,
    email: state.authUser.email,
  };
}
