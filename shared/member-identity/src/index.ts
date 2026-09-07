export type {
  CanonicalAuthUser,
  MemberAccountStatus,
  MemberIdentityError,
  MemberIdentityErrorScope,
  MemberIdentityState,
  StudioRichMember,
} from "./data/memberTypes.js";
export {
  MemberIdentityActionError,
  StudioRichMemberIdentityAuthority,
  normalizeMemberIdentityError,
  type AuthGateway,
  type AuthStateUnsubscribe,
  type MemberIdentityStateListener,
} from "./logic/memberIdentityAuthority.js";
export type { MemberRepository } from "./logic/memberRepository.js";
export {
  STUDIO_RICH_FIREBASE_ENVIRONMENT_KEYS,
  StudioRichFirebaseConfigurationError,
  type StudioRichFirebaseEnvironment,
} from "./firebase/firebaseConfig.js";
export { createFirebaseMemberIdentityAuthority } from "./firebase/createFirebaseMemberIdentityAuthority.js";
