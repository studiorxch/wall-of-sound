import type { RadioScheduleRepository } from "../data/radioScheduleTypes.js";
import { getStudioRichFirebaseApp } from "./firebaseClient.js";
import { readStudioRichFirebaseConfig, type StudioRichFirebaseEnvironment } from "./firebaseConfig.js";
import { getStudioRichFirebaseServices } from "./firebaseServices.js";
import { FirestoreRadioScheduleRepository } from "./firestoreRadioScheduleRepository.js";

const REPOSITORY_REGISTRY_KEY = "__STUDIO_RICH_RADIO_SCHEDULE_REPOSITORIES__";
type RegistryGlobal = typeof globalThis & { [REPOSITORY_REGISTRY_KEY]?: WeakMap<object, RadioScheduleRepository> };

function registry(): WeakMap<object, RadioScheduleRepository> {
  const root = globalThis as RegistryGlobal;
  root[REPOSITORY_REGISTRY_KEY] ??= new WeakMap<object, RadioScheduleRepository>();
  return root[REPOSITORY_REGISTRY_KEY];
}

/** Same one-instance-per-Firebase-app pattern as createFirebaseRadioChannelRepository/createFirebaseEventRadioRepository -- never a second Firestore/App instance for the same environment. */
export function createFirebaseRadioScheduleRepository(
  environment: StudioRichFirebaseEnvironment,
): RadioScheduleRepository {
  const app = getStudioRichFirebaseApp(readStudioRichFirebaseConfig(environment));
  const repositories = registry();
  const existing = repositories.get(app);
  if (existing) return existing;
  const repository = new FirestoreRadioScheduleRepository(
    getStudioRichFirebaseServices(app, environment).firestore,
  );
  repositories.set(app, repository);
  return repository;
}
