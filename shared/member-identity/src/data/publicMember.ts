import type { StudioRichMember } from "./memberTypes.js";

export interface PublicStudioRichMember {
  readonly id: string;
  readonly displayName: string | null;
  readonly photoURL: string | null;
}

/** Public projection deliberately excludes Auth-owned email and account fields. */
export function serializePublicMember(member: StudioRichMember): PublicStudioRichMember {
  return {
    id: member.uid,
    displayName: member.displayName,
    photoURL: member.photoURL,
  };
}
