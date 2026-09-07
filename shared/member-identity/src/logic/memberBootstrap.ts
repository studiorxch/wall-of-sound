import type { CanonicalAuthUser, StudioRichMember } from "../data/memberTypes.js";

export interface NewMemberDocument<TTimestamp> {
  readonly uid: string;
  readonly displayName: string | null;
  readonly photoURL: string | null;
  readonly accountStatus: "active";
  readonly createdAt: TTimestamp;
  readonly updatedAt: TTimestamp;
  readonly lastSeenAt: TTimestamp;
  readonly onboardingVersion: 1;
}

export interface ReturningMemberPatch<TTimestamp> {
  readonly updatedAt: TTimestamp;
  readonly lastSeenAt: TTimestamp;
}

export type MemberBootstrapPlan<TTimestamp> =
  | { readonly kind: "create"; readonly data: NewMemberDocument<TTimestamp> }
  | { readonly kind: "updateLastSeen"; readonly data: ReturningMemberPatch<TTimestamp> };

/**
 * Plans the only writes permitted during auth bootstrap. Existing profile
 * values never come from the provider again, so user-edited fields remain
 * stable across sign-ins.
 */
export function planMemberBootstrap<TTimestamp>(
  existingMember: StudioRichMember | null,
  authUser: CanonicalAuthUser,
  authoritativeTimestamp: TTimestamp,
): MemberBootstrapPlan<TTimestamp> {
  if (existingMember) {
    if (existingMember.uid !== authUser.uid) {
      throw new Error("member_uid_mismatch");
    }

    return {
      kind: "updateLastSeen",
      data: {
        updatedAt: authoritativeTimestamp,
        lastSeenAt: authoritativeTimestamp,
      },
    };
  }

  return {
    kind: "create",
    data: {
      uid: authUser.uid,
      displayName: authUser.displayName,
      photoURL: authUser.photoURL,
      accountStatus: "active",
      createdAt: authoritativeTimestamp,
      updatedAt: authoritativeTimestamp,
      lastSeenAt: authoritativeTimestamp,
      onboardingVersion: 1,
    },
  };
}
