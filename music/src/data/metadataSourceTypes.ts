// Metadata provenance and import tracking types (0705D)

export type MetadataSourceLabel =
  | "verified_catalog"
  | "manual_confirmed"
  | "audiolab_analyzed"
  | "audiolab_estimated"
  | "external_imported"
  | "manual_guess"
  | "estimated"
  | "missing";

// Trust rank — higher index = more trusted
export const METADATA_TRUST_RANK: Record<MetadataSourceLabel, number> = {
  missing:           0,
  estimated:         1,
  manual_guess:      2,
  external_imported: 3,
  audiolab_estimated: 4,
  audiolab_analyzed:  5,
  manual_confirmed:   6,
  verified_catalog:   7,
};

export type TrackMetadataSource = {
  field: string;
  value: unknown;
  source: MetadataSourceLabel;
  sourceFile?: string;
  analysisSource?: string;
  analysisVersion?: string;
  analyzedAt?: string;
  importedAt?: string;
  confidence?: "high" | "medium" | "low" | "unknown";
};

export type FieldChangeClassification =
  | "ADD_MISSING"        // existing is missing/zero/null
  | "REPLACE_ESTIMATE"   // existing is estimated; imported is analyzed
  | "UPDATE_WEAKER"      // imported source has higher trust
  | "KEEP_EXISTING"      // existing is equal or stronger
  | "OVERWRITE_STRONGER" // imported would replace stronger metadata (block by default)
  | "CONFLICT"           // values differ significantly and both appear meaningful
  | "HALF_DOUBLE_CONFLICT" // BPM half/double-time relationship
  | "INVALID";           // imported value fails validation

export type FieldChange = {
  field: string;
  before: unknown;
  after: unknown;
  beforeSource?: MetadataSourceLabel;
  afterSource: MetadataSourceLabel;
  classification: FieldChangeClassification;
  confidence?: "high" | "medium" | "low" | "unknown";
};

export type ImportMatchStatus = "MATCHED" | "PARTIAL" | "UNMATCHED" | "CONFLICT";

export type MetadataImportPreviewRow = {
  trackId: string;
  title: string;
  artist: string;
  filePath?: string;
  matchedBy: "trackId" | "filePath" | "titleArtist" | "filename";
  matchStatus: ImportMatchStatus;
  changes: FieldChange[];
  safeChanges: FieldChange[];   // ADD_MISSING | REPLACE_ESTIMATE | UPDATE_WEAKER
  blockedChanges: FieldChange[]; // OVERWRITE_STRONGER | CONFLICT | INVALID
};

export type MetadataImportPreviewSummary = {
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  safeFields: number;
  blockedFields: number;
  conflictFields: number;
  invalidFields: number;
};

export type UnmatchedImportRow = {
  filename: string;
  filePath?: string;
  title?: string;
  artist?: string;
  durationSeconds?: number;
  bpm?: number;
  reason: string;
};

export type MetadataImportPreview = {
  importId: string;
  sourceFileName: string;
  sourceType: "csv" | "json";
  rows: MetadataImportPreviewRow[];
  unmatchedDetails: UnmatchedImportRow[];
  summary: MetadataImportPreviewSummary;
  errors: string[];
};

export type MetadataImportRecord = {
  importId: string;
  source: "audiolab" | "csv" | "manual";
  sourceFileName: string;
  importedAt: string;
  analysisVersion?: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  appliedFields: number;
  skippedFields: number;
  conflictFields: number;
  invalidFields: number;
  // Coverage context (0705F) — set by App.tsx after computing affected state
  affectedCrateIds?: string[];
  affectedPlaylistIds?: string[];
  staleOptionCount?: number;
  // Unmatched row snapshots for coverage panel (capped to keep storage small)
  unmatchedRows_detail?: Array<{
    filename: string;
    filePath?: string;
    title?: string;
    artist?: string;
    durationSeconds?: number;
    bpm?: number;
    reason: string;
  }>;
};

export type MetadataImportResult = {
  importRecord: MetadataImportRecord;
  appliedCount: number;
  skippedCount: number;
};
