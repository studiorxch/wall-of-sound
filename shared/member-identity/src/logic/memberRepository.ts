import type { CanonicalAuthUser, StudioRichMember } from "../data/memberTypes.js";

export interface MemberRepository {
  getMember(uid: string): Promise<StudioRichMember | null>;
  ensureMemberForAuthUser(authUser: CanonicalAuthUser): Promise<StudioRichMember>;
  updateLastSeen(uid: string): Promise<StudioRichMember>;
}
