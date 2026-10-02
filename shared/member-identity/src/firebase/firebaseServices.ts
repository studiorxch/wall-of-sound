import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import type { FirebaseApp } from "firebase/app";
import type { StudioRichFirebaseEnvironment } from "./firebaseConfig.js";

const EMULATOR_FLAG = "VITE_FIREBASE_USE_EMULATORS";
/**
 * LAN CALIBRATION DEV PATH -- optional override for which host the Auth/
 * Firestore emulator clients connect to. Defaults to the existing
 * `127.0.0.1`-only behavior (every prior consumer/test is unaffected) --
 * only set when a developer explicitly wants another device on the LAN
 * (e.g. an iPad) to reach a Mac's own locally-running emulators. This is
 * NEVER read when `VITE_FIREBASE_USE_EMULATORS` isn't itself true, so it
 * has zero effect on, and never touches, real/production Firebase.
 */
const EMULATOR_HOST_OVERRIDE = "VITE_FIREBASE_EMULATOR_HOST";
const DEFAULT_EMULATOR_HOST = "127.0.0.1";
const AUTH_EMULATOR_PORT = 9099;
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

/**
 * LAN CALIBRATION DEV PATH -- pure, directly testable resolution of which
 * host the emulator clients connect to: `VITE_FIREBASE_EMULATOR_HOST` when
 * it's a genuine non-empty string, else the existing `127.0.0.1` default.
 * Never consulted unless emulator mode itself is already on (see
 * `getStudioRichFirebaseServices` below) -- an override set without the
 * emulator flag has no effect at all, exactly like today.
 */
export function resolveStudioRichFirebaseEmulatorHost(
  environment: StudioRichFirebaseEnvironment,
): string {
  const value = environment[EMULATOR_HOST_OVERRIDE];
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_EMULATOR_HOST;
}

/** Connects once even if the module is re-evaluated during hot reload. */
function connectEmulatorsOnce(auth: Auth, firestore: Firestore, host: string): void {
  const connections = registry();

  if (!connections.auth.has(auth)) {
    connectAuthEmulator(auth, `http://${host}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true });
    connections.auth.add(auth);
  }

  if (!connections.firestore.has(firestore)) {
    connectFirestoreEmulator(firestore, host, FIRESTORE_EMULATOR_PORT);
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
    connectEmulatorsOnce(auth, firestore, resolveStudioRichFirebaseEmulatorHost(environment));
  }

  return { auth, firestore };
}
