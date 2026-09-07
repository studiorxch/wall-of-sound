import { describe, expect, it } from "vitest";
import {
  STUDIO_RICH_FIREBASE_ENVIRONMENT_KEYS,
  StudioRichFirebaseConfigurationError,
  readStudioRichFirebaseConfig,
} from "./firebaseConfig.js";

const environment = {
  VITE_FIREBASE_API_KEY: "api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "example-project",
  VITE_FIREBASE_STORAGE_BUCKET: "example.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456",
  VITE_FIREBASE_APP_ID: "1:123456:web:abc",
};

describe("readStudioRichFirebaseConfig", () => {
  it("maps the six canonical environment values", () => {
    expect(readStudioRichFirebaseConfig(environment)).toEqual({
      apiKey: "api-key",
      authDomain: "example.firebaseapp.com",
      projectId: "example-project",
      storageBucket: "example.firebasestorage.app",
      messagingSenderId: "123456",
      appId: "1:123456:web:abc",
    });
  });

  it("reports every missing value by variable name without exposing values", () => {
    expect.assertions(2);
    try {
      readStudioRichFirebaseConfig({});
    } catch (error) {
      expect(error).toBeInstanceOf(StudioRichFirebaseConfigurationError);
      expect((error as StudioRichFirebaseConfigurationError).missingEnvironmentKeys).toEqual(
        STUDIO_RICH_FIREBASE_ENVIRONMENT_KEYS,
      );
    }
  });
});
