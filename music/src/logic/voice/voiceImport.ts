import { SUPPORTED_AUDIO_EXTENSIONS } from "../../data/importTypes";
import type { VoiceAsset, VoiceAssetSource } from "../../data/voiceLibraryTypes";
import { extractAudioFingerprint } from "../audioImport";
import { createVoiceAsset, nextVoiceAssetVersion } from "./voiceLibraryState";

const VOICE_IMPORT_DESTINATION = "voice/audio";
const SUPPORTED_EXTENSIONS = new Set(SUPPORTED_AUDIO_EXTENSIONS);

export interface VoiceImportDraft {
  file: File;
  name: string;
  text: string | null;
  rating: number | null;
  groupId: string | null;
  voiceProfileId: string | null;
  source: Exclude<VoiceAssetSource, "generated">;
  sourceLabel: string | null;
  parentAssetId: string | null;
  notes: string | null;
}

export interface VoiceImportOutcome {
  imported: VoiceAsset[];
  failed: Array<{ fileName: string; error: string }>;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

export function isSupportedVoiceImportFileName(fileName: string): boolean {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function createVoiceImportDraft(file: File, parentAssetId: string | null = null): VoiceImportDraft {
  return {
    file,
    name: stripExtension(file.name),
    text: null,
    rating: null,
    groupId: null,
    voiceProfileId: null,
    source: "imported",
    sourceLabel: "Imported",
    parentAssetId,
    notes: null,
  };
}

export async function uploadVoiceFile(file: File): Promise<{ filePath: string; fileName: string; durationMs: number }> {
  if (!isSupportedVoiceImportFileName(file.name)) {
    throw new Error("Unsupported audio format.");
  }
  const response = await fetch(`/library-import?filename=${encodeURIComponent(file.name)}&dest=${VOICE_IMPORT_DESTINATION}`, {
    method: "POST",
    body: file,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(error.error ?? `HTTP ${response.status}`);
  }
  const { relPath } = (await response.json()) as { relPath: string };
  const { durationSeconds } = await extractAudioFingerprint(file);
  const fileName = relPath.split("/").pop() ?? file.name;
  return {
    filePath: relPath,
    fileName,
    durationMs: Math.max(0, Math.round((durationSeconds ?? 0) * 1000)),
  };
}

export async function importVoiceFiles(
  drafts: VoiceImportDraft[],
  existingAssets: VoiceAsset[],
  now: string = new Date().toISOString(),
): Promise<VoiceImportOutcome> {
  const imported: VoiceAsset[] = [];
  const failed: Array<{ fileName: string; error: string }> = [];
  for (const draft of drafts) {
    try {
      const uploaded = await uploadVoiceFile(draft.file);
      const version = nextVoiceAssetVersion([...existingAssets, ...imported], draft.parentAssetId);
      imported.push(
        createVoiceAsset(
          {
            name: draft.name,
            text: draft.text,
            durationMs: uploaded.durationMs,
            rating: draft.rating,
            groupId: draft.groupId,
            voiceProfileId: draft.voiceProfileId,
            source: draft.source,
            sourceLabel: draft.sourceLabel,
            provider: null,
            providerVoiceId: null,
            model: null,
            filePath: uploaded.filePath,
            fileName: uploaded.fileName,
            parentAssetId: draft.parentAssetId,
            version,
            notes: draft.notes,
          },
          now,
        ),
      );
    } catch (error) {
      failed.push({ fileName: draft.file.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { imported, failed };
}
