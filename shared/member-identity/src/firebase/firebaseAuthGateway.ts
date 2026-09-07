import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import type { CanonicalAuthUser } from "../data/memberTypes.js";
import type { AuthGateway, AuthStateUnsubscribe } from "../logic/memberIdentityAuthority.js";

function canonicalAuthUser(user: User): CanonicalAuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    photoURL: user.photoURL,
    email: user.email,
    emailVerified: user.emailVerified,
    providerIds: [...new Set(user.providerData.map((provider) => provider.providerId))],
  };
}

export class FirebaseAuthGateway implements AuthGateway {
  private readonly googleProvider = new GoogleAuthProvider();

  constructor(private readonly auth: Auth) {}

  configureDurablePersistence(): Promise<void> {
    return setPersistence(this.auth, browserLocalPersistence);
  }

  observeAuthState(
    onUser: (user: CanonicalAuthUser | null) => void,
    onError: (error: unknown) => void,
  ): AuthStateUnsubscribe {
    return onAuthStateChanged(
      this.auth,
      (user) => onUser(user ? canonicalAuthUser(user) : null),
      onError,
    );
  }

  async signInWithEmailPassword(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async createAccountWithEmailPassword(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(this.auth, email, password);
  }

  async signInWithGoogle(): Promise<void> {
    await signInWithPopup(this.auth, this.googleProvider);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }
}
