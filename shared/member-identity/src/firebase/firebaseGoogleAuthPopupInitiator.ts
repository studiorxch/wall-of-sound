import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getStudioRichFirebaseApp } from "./firebaseClient.js";
import { readStudioRichFirebaseConfig, type StudioRichFirebaseEnvironment } from "./firebaseConfig.js";
import { getStudioRichFirebaseServices } from "./firebaseServices.js";

/**
 * HOST-03B -- the ONE thing a persistent HOME needs to own for hosted
 * authentication: initiating and completing the Google popup from HOME's own
 * window, which (unlike a hosted MAP/BLACKBOOK surface) is never itself
 * nested inside another browsing context. This does NOT construct a
 * MemberIdentityAuthority, does not bootstrap a Firestore member profile,
 * and does not become a second source of member state -- it returns only an
 * opaque, serialized OAuth credential for the REQUESTING surface's own
 * existing MemberIdentityAuthority to complete sign-in with, via
 * `signInWithCredential` (see FirebaseAuthGateway's own doc).
 *
 * Reuses the exact same config/app/emulator bootstrap every other Firebase
 * consumer in this package already goes through -- no parallel
 * initialization path, no duplicated emulator-connection logic.
 */
export interface GoogleAuthPopupInitiator {
  /** Throws on any failure -- popup blocked/closed, network/auth error, or a missing credential. Callers classify the thrown error themselves. */
  signInWithGooglePopup(): Promise<unknown>;
}

export function createFirebaseGoogleAuthPopupInitiator(
  environment: StudioRichFirebaseEnvironment,
): GoogleAuthPopupInitiator {
  const config = readStudioRichFirebaseConfig(environment);
  const app = getStudioRichFirebaseApp(config);
  const { auth } = getStudioRichFirebaseServices(app, environment);
  const provider = new GoogleAuthProvider();

  return {
    async signInWithGooglePopup(): Promise<unknown> {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential) throw new Error("google_credential_missing");
      return credential.toJSON();
    },
  };
}
