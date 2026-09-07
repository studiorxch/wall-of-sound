import {
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";

const DEFAULT_FIREBASE_APP_NAME = "[DEFAULT]";
const CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const satisfies readonly (keyof FirebaseOptions)[];

function sameConfiguration(existing: FirebaseOptions, requested: FirebaseOptions): boolean {
  return CONFIG_KEYS.every((key) => existing[key] === requested[key]);
}

/**
 * The sole Firebase app initializer for StudioRich human identity. getApps()
 * makes reuse survive module hot reload instead of creating another app.
 */
export function getStudioRichFirebaseApp(config: FirebaseOptions): FirebaseApp {
  const apps = getApps();
  const existing = apps.find((app) => app.name === DEFAULT_FIREBASE_APP_NAME);
  const competingApps = apps.filter((app) => app.name !== DEFAULT_FIREBASE_APP_NAME);

  if (competingApps.length) {
    throw new Error("competing_firebase_app_detected");
  }

  if (existing) {
    if (!sameConfiguration(existing.options, config)) {
      throw new Error("firebase_app_configuration_mismatch");
    }
    return existing;
  }

  return initializeApp(config);
}
