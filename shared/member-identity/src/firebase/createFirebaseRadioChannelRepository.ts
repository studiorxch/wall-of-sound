import type { RadioChannelRepository } from "../data/radioChannelTypes.js";
import { getStudioRichFirebaseApp } from "./firebaseClient.js";
import { readStudioRichFirebaseConfig, type StudioRichFirebaseEnvironment } from "./firebaseConfig.js";
import { getStudioRichFirebaseServices } from "./firebaseServices.js";
import { FirestoreRadioChannelRepository } from "./firestoreRadioChannelRepository.js";

const REPOSITORY_REGISTRY_KEY = "__STUDIO_RICH_RADIO_CHANNEL_REPOSITORIES__";
type RegistryGlobal = typeof globalThis & { [REPOSITORY_REGISTRY_KEY]?: WeakMap<object, RadioChannelRepository> };

function registry(): WeakMap<object, RadioChannelRepository> {
  const root = globalThis as RegistryGlobal;
  root[REPOSITORY_REGISTRY_KEY] ??= new WeakMap<object, RadioChannelRepository>();
  return root[REPOSITORY_REGISTRY_KEY];
}

/** Same one-instance-per-Firebase-app pattern as createFirebaseEventRadioRepository/createFirebaseArtworkRepository -- never a second Firestore/App instance for the same environment. */
export function createFirebaseRadioChannelRepository(
  environment: StudioRichFirebaseEnvironment,
): RadioChannelRepository {
  const app = getStudioRichFirebaseApp(readStudioRichFirebaseConfig(environment));
  const repositories = registry();
  const existing = repositories.get(app);
  if (existing) return existing;
  const repository = new FirestoreRadioChannelRepository(
    getStudioRichFirebaseServices(app, environment).firestore,
  );
  repositories.set(app, repository);
  return repository;
}
