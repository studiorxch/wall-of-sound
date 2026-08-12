// Machine Life Pre-Life manifest adapter (0811_MACHINE-LIFE_MUSIC-Research-
// Workspace-Handoff_v1.0.0, Data Layer). Stage → validate → commit, mirroring
// the existing governed import pipeline's two-phase shape (audioImport.ts /
// importIntake.ts) without reusing Track-specific logic — a Pre-Life manifest
// describes a research collection, not an individual audio file.
//
// Pure, DOM-free functions only, so they are directly testable against the
// real stage-00-pre-life-manifest.json content (see
// machineLifeManifestAdapter.test.ts) without a browser.

import type {
  MachineLifeCategory,
  MachineLifeCollection,
  MachineLifeConstructionMode,
  MachineLifeRawSource,
  MachineLifeRecording,
  MachineLifeSourceCollection,
  MachineLifeSourceUse,
} from "../../data/machineLifeTypes";
import { MACHINE_LIFE_PRE_LIFE_MANIFEST_SCHEMA } from "../../data/machineLifeTypes";

const VALID_CATEGORIES: MachineLifeCategory[] = [
  "signal", "pulse", "texture", "environment", "gesture", "collision", "structure", "free-dream",
];
const VALID_MODES: MachineLifeConstructionMode[] = ["layer", "sequence"];
const VALID_SOURCE_COLLECTIONS: MachineLifeSourceCollection[] = ["primitive", "studiorich-raw", "transformations"];

// ── Raw manifest shape (pre-validation) ──────────────────────────────────────

interface RawSourceUse {
  filename?: unknown;
  collection?: unknown;
  sha256?: unknown;
  start_seconds?: unknown;
}

interface RawRecording {
  id?: unknown;
  category?: unknown;
  mode?: unknown;
  seed?: unknown;
  duration_seconds?: unknown;
  filename?: unknown;
  source_uses?: unknown;
  sha256?: unknown;
  waveform?: unknown;
  spectrogram?: unknown;
  recipe?: unknown;
}

interface RawSourceInventoryEntry {
  filename?: unknown;
  collection?: unknown;
  sha256?: unknown;
  duration_seconds?: unknown;
}

interface RawManifest {
  schema?: unknown;
  engine?: unknown;
  engine_version?: unknown;
  identity_note?: unknown;
  recording_count?: unknown;
  recordings?: unknown;
  source_inventory?: unknown;
  source_collections?: unknown;
}

// ── Parse ─────────────────────────────────────────────────────────────────

export type ManifestParseResult =
  | { ok: true; raw: RawManifest }
  | { ok: false; error: string };

export function parseMachineLifeManifestText(text: string): ManifestParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Could not parse manifest JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Manifest is not a JSON object." };
  }
  return { ok: true, raw: parsed as RawManifest };
}

// ── Schema gate ───────────────────────────────────────────────────────────

export function isSupportedManifestSchema(raw: RawManifest): boolean {
  return raw.schema === MACHINE_LIFE_PRE_LIFE_MANIFEST_SCHEMA;
}

// ── Field validation ──────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function validateSourceUse(u: RawSourceUse, path: string, errors: string[]): MachineLifeSourceUse | null {
  if (!isNonEmptyString(u.filename)) errors.push(`${path}.filename missing`);
  if (!VALID_SOURCE_COLLECTIONS.includes(u.collection as MachineLifeSourceCollection)) {
    errors.push(`${path}.collection invalid: ${String(u.collection)}`);
  }
  if (!isNonEmptyString(u.sha256)) errors.push(`${path}.sha256 missing`);
  if (typeof u.start_seconds !== "number") errors.push(`${path}.start_seconds missing`);
  if (errors.length > 0) return null;
  return {
    filename: u.filename as string,
    collection: u.collection as MachineLifeSourceCollection,
    sha256: u.sha256 as string,
    startSeconds: u.start_seconds as number,
  };
}

function validateRecording(r: RawRecording, index: number, errors: string[]): MachineLifeRecording | null {
  const path = `recordings[${index}]`;
  const localErrors: string[] = [];
  if (!isNonEmptyString(r.id)) localErrors.push(`${path}.id missing`);
  if (!VALID_CATEGORIES.includes(r.category as MachineLifeCategory)) localErrors.push(`${path}.category invalid: ${String(r.category)}`);
  if (!VALID_MODES.includes(r.mode as MachineLifeConstructionMode)) localErrors.push(`${path}.mode invalid: ${String(r.mode)}`);
  if (typeof r.seed !== "number") localErrors.push(`${path}.seed missing`);
  if (typeof r.duration_seconds !== "number") localErrors.push(`${path}.duration_seconds missing`);
  if (!isNonEmptyString(r.filename)) localErrors.push(`${path}.filename missing`);
  if (!isNonEmptyString(r.sha256)) localErrors.push(`${path}.sha256 missing`);
  if (!Array.isArray(r.source_uses) || r.source_uses.length === 0) {
    localErrors.push(`${path}.source_uses missing or empty`);
  }
  if (localErrors.length > 0) {
    errors.push(...localErrors);
    return null;
  }
  const sourceUses: MachineLifeSourceUse[] = [];
  (r.source_uses as RawSourceUse[]).forEach((u, i) => {
    const validated = validateSourceUse(u, `${path}.source_uses[${i}]`, errors);
    if (validated) sourceUses.push(validated);
  });
  if (sourceUses.length !== (r.source_uses as unknown[]).length) return null;

  return {
    id: r.id as string,
    category: r.category as MachineLifeCategory,
    mode: r.mode as MachineLifeConstructionMode,
    seed: r.seed as number,
    durationSeconds: r.duration_seconds as number,
    canonicalFilename: r.filename as string,
    canonicalChecksumSha256: r.sha256 as string,
    sourceUses,
    waveformEvidencePath: isNonEmptyString(r.waveform) ? r.waveform : undefined,
    spectrogramEvidencePath: isNonEmptyString(r.spectrogram) ? r.spectrogram : undefined,
    recipeEvidencePath: isNonEmptyString(r.recipe) ? r.recipe : undefined,
  };
}

function validateRawSource(s: RawSourceInventoryEntry, index: number, errors: string[]): MachineLifeRawSource | null {
  const path = `source_inventory[${index}]`;
  if (!isNonEmptyString(s.filename)) { errors.push(`${path}.filename missing`); return null; }
  if (!isNonEmptyString(s.sha256)) { errors.push(`${path}.sha256 missing`); return null; }
  return {
    filename: s.filename,
    checksumSha256: s.sha256,
    durationSeconds: typeof s.duration_seconds === "number" ? s.duration_seconds : undefined,
  };
}

export interface ManifestValidationResult {
  ok: boolean;
  errors: string[];
  recordings: MachineLifeRecording[];
  rawSources: MachineLifeRawSource[];
}

/** Validates a manifest already confirmed to carry the supported schema. */
export function validateMachineLifeManifest(raw: RawManifest): ManifestValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(raw.engine)) errors.push("engine missing");
  if (!isNonEmptyString(raw.engine_version)) errors.push("engine_version missing");
  if (!isNonEmptyString(raw.identity_note)) errors.push("identity_note missing");
  if (typeof raw.recording_count !== "number") errors.push("recording_count missing");
  if (!Array.isArray(raw.recordings)) errors.push("recordings missing or not an array");
  if (!Array.isArray(raw.source_inventory)) errors.push("source_inventory missing or not an array");

  if (errors.length > 0) return { ok: false, errors, recordings: [], rawSources: [] };

  const recordings: MachineLifeRecording[] = [];
  (raw.recordings as RawRecording[]).forEach((r, i) => {
    const validated = validateRecording(r, i, errors);
    if (validated) recordings.push(validated);
  });

  if (recordings.length !== (raw.recordings as unknown[]).length) {
    return { ok: false, errors, recordings: [], rawSources: [] };
  }

  if (raw.recording_count !== recordings.length) {
    errors.push(`recording_count (${String(raw.recording_count)}) does not match recordings.length (${recordings.length})`);
  }

  const ids = new Set<string>();
  for (const rec of recordings) {
    if (ids.has(rec.id)) errors.push(`duplicate recording id in manifest: ${rec.id}`);
    ids.add(rec.id);
  }

  const rawSources: MachineLifeRawSource[] = [];
  (raw.source_inventory as RawSourceInventoryEntry[])
    .filter((s) => s.collection === "studiorich-raw")
    .forEach((s, i) => {
      const validated = validateRawSource(s, i, errors);
      if (validated) rawSources.push(validated);
    });

  return { ok: errors.length === 0, errors, recordings, rawSources };
}

// ── Collection identity (for duplicate collection/version detection) ────────

// Deterministic, non-cryptographic string hash (FNV-1a) — used only as an
// internal dedup key, never presented as or substituted for a canonical
// SHA-256 checksum (those remain on MachineLifeRecording/MachineLifeRawSource
// exactly as imported).
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function computeMachineLifeCollectionId(raw: RawManifest, recordings: MachineLifeRecording[]): string {
  const sortedIds = recordings.map((r) => r.id).slice().sort().join(",");
  const fingerprint = `${String(raw.schema)}:${String(raw.engine_version)}:${String(raw.recording_count)}:${sortedIds}`;
  return `mlcoll_${fnv1a(fingerprint)}`;
}

// ── Stage → commit ────────────────────────────────────────────────────────

export type MachineLifeManifestStageResult =
  | { status: "rejected_schema"; error: string }
  | { status: "rejected_invalid"; errors: string[] }
  | { status: "duplicate"; existingCollectionId: string }
  | { status: "staged"; collection: MachineLifeCollection };

/**
 * Stage phase: parse, gate schema, validate fields, detect duplicate
 * collection/version. Never mutates existingCollections. Returns a
 * discriminated result the UI/commit step uses to decide the next action —
 * mirrors importIntake.ts's stage-then-commit shape without touching Track
 * identity or the audio import pipeline.
 */
export function stageMachineLifeManifestImport(
  manifestText: string,
  importSourceManifestPath: string,
  existingCollections: MachineLifeCollection[],
  now: string,
): MachineLifeManifestStageResult {
  const parsed = parseMachineLifeManifestText(manifestText);
  if (!parsed.ok) return { status: "rejected_schema", error: parsed.error };

  if (!isSupportedManifestSchema(parsed.raw)) {
    return {
      status: "rejected_schema",
      error: `Unsupported manifest schema: ${String(parsed.raw.schema)}. Expected ${MACHINE_LIFE_PRE_LIFE_MANIFEST_SCHEMA}.`,
    };
  }

  const validation = validateMachineLifeManifest(parsed.raw);
  if (!validation.ok) {
    return { status: "rejected_invalid", errors: validation.errors };
  }

  const collectionId = computeMachineLifeCollectionId(parsed.raw, validation.recordings);
  const existing = existingCollections.find((c) => c.id === collectionId);
  if (existing) {
    return { status: "duplicate", existingCollectionId: existing.id };
  }

  const raw = parsed.raw;
  const collection: MachineLifeCollection = {
    id: collectionId,
    schema: MACHINE_LIFE_PRE_LIFE_MANIFEST_SCHEMA,
    collectionVersion: "Stage-00-Pre-Life-Recordings-v1",
    engine: raw.engine as string,
    engineVersion: raw.engine_version as string,
    identityNote: raw.identity_note as string,
    recordingCount: validation.recordings.length,
    recordings: validation.recordings,
    rawSources: validation.rawSources,
    importedAt: now,
    importSourceManifestPath,
  };
  return { status: "staged", collection };
}

/**
 * Commit phase: append a staged collection to the project's collection list
 * in one step (no partial writes — the caller performs exactly one state
 * update with this function's return value, same "single array replace"
 * pattern App.tsx already uses for handleCommitImportIntake).
 *
 * Idempotent by collection id: never appends a second entry for an id
 * already present, regardless of whether the caller re-checked the staged
 * "duplicate" status first — duplicate-import rejection must hold even if a
 * future call site forgets that check.
 */
export function commitMachineLifeManifestImport(
  existingCollections: MachineLifeCollection[],
  staged: MachineLifeCollection,
): MachineLifeCollection[] {
  if (existingCollections.some((c) => c.id === staged.id)) return existingCollections;
  return [...existingCollections, staged];
}
