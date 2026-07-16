import type { AnalysisStatus, AnalysisSource, PlatformUse, TrackSourceOwner } from "./trackTypes";

export type LibrarySourceKind =
  | "studiorich_catalog"
  | "external_library"
  | "reference_library"
  | "playlist"
  | "group"
  | "unknown_review";

export interface LibrarySourceDefinition {
  id: string;
  label: string;
  kind: LibrarySourceKind;
  sourceOwner: TrackSourceOwner;
  sourceLibrary: string;
  catalogCsvPath?: string;   // display hint — browser can't read arbitrary paths
  seedJsonUrl?: string;      // public URL for seeding via fetch
  audioFolderPath?: string;
  allowedImportTypes: Array<"csv" | "audio_folder" | "m3u" | "json">;
  defaultPlatformUse: PlatformUse[];
  defaultAnalysisStatus: AnalysisStatus;
  defaultAnalysisSources?: AnalysisSource[];
  lastScannedAt?: string;
  lastImportReportId?: string;
}

export interface LibraryScanReport {
  id: string;
  sourceId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "complete" | "failed";
  importedCount: number;
  updatedCount: number;
  unchangedCount?: number;
  duplicateSkippedCount?: number;
  rejectedCount: number;
  missingAudioCount?: number;
  linkedAudioCount?: number;
  unmappedFields?: string[];
  errors?: string[];
}

/** Fixed filesystem roots for each library source.
 *  __LIBRARY_ROOT__ is injected at build time by vite.config.ts (absolute path).
 *  The /library-data and /library-ls Vite endpoints resolve absolute paths as-is. */
const _LIB = __LIBRARY_ROOT__
export const LIBRARY_PATHS: Record<"studiorich" | "external" | "reference", { csv: string; audio: string }> = {
  studiorich: { csv: `${_LIB}/catalog/tracks.csv`,  audio: `${_LIB}/catalog/audio` },
  external:   { csv: `${_LIB}/external/tracks.csv`, audio: `${_LIB}/external/audio` },
  reference:  { csv: `${_LIB}/reference/tracks.csv`, audio: `${_LIB}/reference/audio` },
};

// Default source definitions — seeded into new projects
export const DEFAULT_LIBRARY_SOURCES: LibrarySourceDefinition[] = [
  {
    id: "src_studiorich",
    label: "StudioRich Catalog",
    kind: "studiorich_catalog",
    sourceOwner: "studiorich",
    sourceLibrary: "StudioRich Catalog",
    catalogCsvPath: "/Users/studio/Projects/wall-of-sound/data/catalog/studiorich/catalog_v2.csv",
    seedJsonUrl: "/catalog/studiorich-seed.json",
    allowedImportTypes: ["csv", "audio_folder", "json"],
    defaultPlatformUse: ["internal", "studiorich_stream"],
    defaultAnalysisStatus: "partial",
    defaultAnalysisSources: ["import", "external_tool"],
  },
  {
    id: "src_external",
    label: "External",
    kind: "external_library",
    sourceOwner: "external",
    sourceLibrary: "External",
    allowedImportTypes: ["csv", "audio_folder", "m3u"],
    defaultPlatformUse: ["mixcloud", "reference_only"],
    defaultAnalysisStatus: "partial",
    defaultAnalysisSources: ["import", "external_tool"],
  },
  {
    id: "src_reference",
    label: "Reference",
    kind: "reference_library",
    sourceOwner: "reference",
    sourceLibrary: "Reference",
    allowedImportTypes: ["csv", "audio_folder", "m3u"],
    defaultPlatformUse: ["reference_only"],
    defaultAnalysisStatus: "not_analyzed",
    defaultAnalysisSources: ["import"],
  },
];
