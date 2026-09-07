export type MemberAccountStatus = "active" | "suspended" | "deleted";

/**
 * Canonical StudioRich human profile. Firebase stores these dates as Firestore
 * timestamps; the repository normalizes them to Date so consumers do not need
 * Firebase types.
 */
export interface StudioRichMember {
  readonly uid: string;
  readonly displayName: string | null;
  readonly photoURL: string | null;
  readonly accountStatus: MemberAccountStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastSeenAt: Date;
  readonly onboardingVersion: number;
}

/** Firebase Auth-owned identity data, normalized for product consumers. */
export interface CanonicalAuthUser {
  readonly uid: string;
  readonly displayName: string | null;
  readonly photoURL: string | null;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly providerIds: readonly string[];
}

export type MemberIdentityErrorScope =
  | "configuration"
  | "session"
  | "signIn"
  | "createAccount"
  | "googleSignIn"
  | "signOut"
  | "member";

export interface MemberIdentityError {
  readonly scope: MemberIdentityErrorScope;
  readonly code: string;
  readonly message: string;
}

export type MemberIdentityState =
  | {
      readonly status: "initializing";
      readonly authUser: CanonicalAuthUser | null;
      readonly member: null;
      readonly error: null;
    }
  | {
      readonly status: "signedOut";
      readonly authUser: null;
      readonly member: null;
      readonly error: null;
    }
  | {
      readonly status: "signedIn";
      readonly authUser: CanonicalAuthUser;
      readonly member: StudioRichMember;
      readonly error: null;
    }
  | {
      readonly status: "error";
      readonly authUser: CanonicalAuthUser | null;
      readonly member: null;
      readonly error: MemberIdentityError;
    };
