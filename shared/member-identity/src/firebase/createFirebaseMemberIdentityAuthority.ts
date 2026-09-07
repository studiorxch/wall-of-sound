import { FirebaseAuthGateway } from "./firebaseAuthGateway.js";
import { getStudioRichFirebaseApp } from "./firebaseClient.js";
import {
  readStudioRichFirebaseConfig,
  type StudioRichFirebaseEnvironment,
} from "./firebaseConfig.js";
import {
  getStudioRichFirebaseServices,
  shouldUseStudioRichFirebaseEmulators,
} from "./firebaseServices.js";
import { FirestoreMemberRepository } from "./firestoreMemberRepository.js";
import {
  StudioRichMemberIdentityAuthority,
  type MemberIdentityAuthority,
} from "../logic/memberIdentityAuthority.js";

const AUTHORITY_REGISTRY_KEY = "__STUDIO_RICH_MEMBER_IDENTITY_AUTHORITIES__";

interface RegisteredAuthority {
  readonly authority: MemberIdentityAuthority;
  readonly usesEmulators: boolean;
}

type AuthorityRegistryGlobal = typeof globalThis & {
  [AUTHORITY_REGISTRY_KEY]?: WeakMap<object, RegisteredAuthority>;
};

function authorityRegistry(): WeakMap<object, RegisteredAuthority> {
  const registryGlobal = globalThis as AuthorityRegistryGlobal;
  registryGlobal[AUTHORITY_REGISTRY_KEY] ??= new WeakMap<object, RegisteredAuthority>();
  return registryGlobal[AUTHORITY_REGISTRY_KEY];
}

export function createFirebaseMemberIdentityAuthority(
  environment: StudioRichFirebaseEnvironment,
): MemberIdentityAuthority {
  const config = readStudioRichFirebaseConfig(environment);
  const app = getStudioRichFirebaseApp(config);
  const registry = authorityRegistry();
  const usesEmulators = shouldUseStudioRichFirebaseEmulators(environment);
  const registered = registry.get(app);
  if (registered) {
    if (registered.usesEmulators !== usesEmulators) {
      throw new Error("firebase_emulator_mode_mismatch");
    }
    return registered.authority;
  }

  const services = getStudioRichFirebaseServices(app, environment);
  const authority = new StudioRichMemberIdentityAuthority(
    new FirebaseAuthGateway(services.auth),
    new FirestoreMemberRepository(services.firestore),
  );
  registry.set(app, { authority, usesEmulators });
  return authority;
}
