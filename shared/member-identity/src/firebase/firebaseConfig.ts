import type { FirebaseOptions } from "firebase/app";

export const STUDIO_RICH_FIREBASE_ENVIRONMENT_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export type StudioRichFirebaseEnvironment = Readonly<Record<string, unknown>>;

export class StudioRichFirebaseConfigurationError extends Error {
  readonly missingEnvironmentKeys: readonly string[];

  constructor(missingEnvironmentKeys: readonly string[]) {
    super(
      `Missing StudioRich Firebase environment configuration: ${missingEnvironmentKeys.join(", ")}`,
    );
    this.name = "StudioRichFirebaseConfigurationError";
    this.missingEnvironmentKeys = missingEnvironmentKeys;
  }
}

function requiredString(environment: StudioRichFirebaseEnvironment, key: string): string | null {
  const value = environment[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readStudioRichFirebaseConfig(
  environment: StudioRichFirebaseEnvironment,
): FirebaseOptions {
  const values = new Map<string, string>();
  const missing: string[] = [];

  for (const key of STUDIO_RICH_FIREBASE_ENVIRONMENT_KEYS) {
    const value = requiredString(environment, key);
    if (value) values.set(key, value);
    else missing.push(key);
  }

  if (missing.length) throw new StudioRichFirebaseConfigurationError(missing);

  return {
    apiKey: values.get("VITE_FIREBASE_API_KEY"),
    authDomain: values.get("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: values.get("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: values.get("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: values.get("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: values.get("VITE_FIREBASE_APP_ID"),
  };
}
