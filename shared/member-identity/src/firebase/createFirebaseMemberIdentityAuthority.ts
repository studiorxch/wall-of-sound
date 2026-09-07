import { FirebaseAuthGateway } from "./firebaseAuthGateway.js";
import { getStudioRichFirebaseApp } from "./firebaseClient.js";
import {
  readStudioRichFirebaseConfig,
  type StudioRichFirebaseEnvironment,
} from "./firebaseConfig.js";
import { getStudioRichFirebaseServices } from "./firebaseServices.js";
import { FirestoreMemberRepository } from "./firestoreMemberRepository.js";
import { StudioRichMemberIdentityAuthority } from "../logic/memberIdentityAuthority.js";

export function createFirebaseMemberIdentityAuthority(
  environment: StudioRichFirebaseEnvironment,
): StudioRichMemberIdentityAuthority {
  const config = readStudioRichFirebaseConfig(environment);
  const app = getStudioRichFirebaseApp(config);
  const services = getStudioRichFirebaseServices(app, environment);
  return new StudioRichMemberIdentityAuthority(
    new FirebaseAuthGateway(services.auth),
    new FirestoreMemberRepository(services.firestore),
  );
}
