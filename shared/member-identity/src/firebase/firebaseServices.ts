import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import type { FirebaseApp } from "firebase/app";
import type { StudioRichFirebaseEnvironment } from "./firebaseConfig.js";

const EMULATOR_FLAG = "VITE_FIREBASE_USE_EMULATORS";
const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
const FIRESTORE_EMULATOR_HOST = "127.0.0.1";
const FIRESTORE_EMULATOR_PORT = 8080;
const REGISTRY_KEY = "__STUDIO_RICH_MEMBER_FIREBASE_EMULATOR_CONNECTIONS__";

interface EmulatorConnectionRegistry {
  readonly auth: WeakSet<Auth>;
  readonly firestore: WeakSet<Firestore>;
}

interface MemberFirebaseServices {
  readonly auth: Auth;
  readonly firestore: Firestore;
}

type RegistryGlobal = typeof globalThis & {
  [REGISTRY_KEY]?: EmulatorConnectionRegistry;
};

function registry(): EmulatorConnectionRegistry {
  const globalRegistry = globalThis as RegistryGlobal;
  globalRegistry[REGISTRY_KEY] ??= {
    auth: new WeakSet<Auth>(),
    firestore: new WeakSet<Firestore>(),
  };
  return globalRegistry[REGISTRY_KEY];
}

export function shouldUseStudioRichFirebaseEmulators(
  environment: StudioRichFirebaseEnvironment,
): boolean {
  const value = environment[EMULATOR_FLAG];
  return value === true || value === "true";
}

/** Connects once even if the module is re-evaluated during hot reload. */
function connectEmulatorsOnce(auth: Auth, firestore: Firestore): void {
  const connections = registry();

  if (!connections.auth.has(auth)) {
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
    connections.auth.add(auth);
  }

  if (!connections.firestore.has(firestore)) {
    connectFirestoreEmulator(firestore, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    connections.firestore.add(firestore);
  }
}

export function getStudioRichFirebaseServices(
  app: FirebaseApp,
  environment: StudioRichFirebaseEnvironment,
): MemberFirebaseServices {
  const auth = getAuth(app);
  const firestore = getFirestore(app);

  if (shouldUseStudioRichFirebaseEmulators(environment)) {
    connectEmulatorsOnce(auth, firestore);
  }

  return { auth, firestore };
}
