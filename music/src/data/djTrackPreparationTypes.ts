import type { MusicalGridRevision } from "./loopTypes";

export type DjTrackPreparationStatus = "draft" | "reviewed" | "approved" | "stale";
export type DjPhraseBars = 4 | 8 | 16 | 32;
export type DjPhraseProvenance = "inferred" | "manually_confirmed";
export type DjPreparationCueRole = "FULL_ENTRY" | "SHORT_ENTRY" | "MAIN_ENTRY" | "MIX_OUT";

export interface DjPhraseBoundary {
  barIndex: number;
  groupingBars: DjPhraseBars;
  provenance: DjPhraseProvenance;
  confidence: number;
}

export interface DjPhraseGridPreparation {
  basisGridRevisionId: string;
  originBarIndex: number;
  enabledGroupings: DjPhraseBars[];
  boundaries: DjPhraseBoundary[];
  updatedAt: string;
}

export interface DjPreparationCue {
  id: string;
  role: DjPreparationCueRole;
  frame: number;
  basisGridRevisionId: string;
  beatIndex?: number;
  barIndex?: number;
  phraseBoundaryBarIndex?: number;
  origin: "suggested" | "manual";
  provenance: "proposed" | "manually_confirmed";
  confidence: number;
  updatedAt: string;
}

export interface DjPreparationBasis {
  sourceTrackId: string;
  sourceMediaFingerprint: string;
  beatMapRevisionKey: string;
  activeGridRevisionId: string;
  activeGridRevisionKey: string;
  songAnalysisRevisionKey: string;
  sectionRevisionKey: string;
  sampleRate: number;
  decodedFrameCount: number;
}

export interface DjTrackPreparation {
  id: string;
  sourceTrackId: string;
  status: DjTrackPreparationStatus;
  gridRevisions: MusicalGridRevision[];
  activeGridRevisionId: string | null;
  phraseGrid?: DjPhraseGridPreparation;
  cues: Partial<Record<DjPreparationCueRole, DjPreparationCue>>;
  approvalBasis?: DjPreparationBasis;
  approvalRevisionKey?: string;
  reviewedAt?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
