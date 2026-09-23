import type { CanonicalAuthUser, StudioRichMember } from "../data/memberTypes.js";

export interface MemberRepository {
  getMember(uid: string): Promise<StudioRichMember | null>;
  ensureMemberForAuthUser(authUser: CanonicalAuthUser): Promise<StudioRichMember>;
  updateLastSeen(uid: string): Promise<StudioRichMember>;
  /**
   * Member V1A: StudioRich's own profile edit. Only `displayName` -- the one
   * field Profile V1A allows editing. This is an update to the EXISTING
   * closed member schema (already permitted by firestore.rules' `members`
   * update allow-list), not a new field.
   */
  updateDisplayName(uid: string, displayName: string): Promise<StudioRichMember>;
}
