import type { EventRadioRepository } from "../data/eventRadioTypes.js";
import { getStudioRichFirebaseApp } from "./firebaseClient.js";
import { readStudioRichFirebaseConfig, type StudioRichFirebaseEnvironment } from "./firebaseConfig.js";
import { getStudioRichFirebaseServices } from "./firebaseServices.js";
import { FirestoreEventRadioRepository } from "./firestoreEventRadioRepository.js";

const REPOSITORY_REGISTRY_KEY = "__STUDIO_RICH_EVENT_RADIO_REPOSITORIES__";
type RegistryGlobal = typeof globalThis & { [REPOSITORY_REGISTRY_KEY]?: WeakMap<object, EventRadioRepository> };

function registry(): WeakMap<object, EventRadioRepository> {
  const root = globalThis as RegistryGlobal;
  root[REPOSITORY_REGISTRY_KEY] ??= new WeakMap<object, EventRadioRepository>();
  return root[REPOSITORY_REGISTRY_KEY];
}

/** Same one-instance-per-Firebase-app pattern as createFirebaseArtworkRepository -- never a second Firestore/App instance for the same environment. */
export function createFirebaseEventRadioRepository(
  environment: StudioRichFirebaseEnvironment,
): EventRadioRepository {
  const app = getStudioRichFirebaseApp(readStudioRichFirebaseConfig(environment));
  const repositories = registry();
  const existing = repositories.get(app);
  if (existing) return existing;
  const repository = new FirestoreEventRadioRepository(
    getStudioRichFirebaseServices(app, environment).firestore,
  );
  repositories.set(app, repository);
  return repository;
}
