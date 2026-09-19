import type { ArtworkRepository } from "../data/artworkTypes.js";
import { getStudioRichFirebaseApp } from "./firebaseClient.js";
import { readStudioRichFirebaseConfig, type StudioRichFirebaseEnvironment } from "./firebaseConfig.js";
import { getStudioRichFirebaseServices } from "./firebaseServices.js";
import { FirestoreArtworkRepository } from "./firestoreArtworkRepository.js";

const REPOSITORY_REGISTRY_KEY = "__STUDIO_RICH_ARTWORK_REPOSITORIES__";
type RegistryGlobal = typeof globalThis & { [REPOSITORY_REGISTRY_KEY]?: WeakMap<object, ArtworkRepository> };

function registry(): WeakMap<object, ArtworkRepository> {
  const root = globalThis as RegistryGlobal;
  root[REPOSITORY_REGISTRY_KEY] ??= new WeakMap<object, ArtworkRepository>();
  return root[REPOSITORY_REGISTRY_KEY];
}

export function createFirebaseArtworkRepository(
  environment: StudioRichFirebaseEnvironment,
): ArtworkRepository {
  const app = getStudioRichFirebaseApp(readStudioRichFirebaseConfig(environment));
  const repositories = registry();
  const existing = repositories.get(app);
  if (existing) return existing;
  const repository = new FirestoreArtworkRepository(
    getStudioRichFirebaseServices(app, environment).firestore,
  );
  repositories.set(app, repository);
  return repository;
}
