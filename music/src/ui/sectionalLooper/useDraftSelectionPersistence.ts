// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §17-§20 —
// draft-selection persistence. Restoring a draft NEVER resumes playback
// (§18) — this hook only ever touches selection/highlight state via
// `onRestore`, never the loopAudition controller. A stale draft (§20) is
// surfaced via `staleDraft`, never silently remapped or silently applied.

import { useEffect, useRef, useState } from "react";
import type { DraftLoopSelection, TimelineSelection } from "../../data/loopTypes";
import { isDraftStale } from "../../logic/loops/draftSelectionStaleness";

export interface DraftContext {
  sourceTrackId: string;
  experimentId?: string;
  sourceFingerprint: string;
  durationSeconds: number;
  gridRevisionId: string;
  segmentationRevisionId: string;
  sampleRate: number;
}

export interface UseDraftSelectionPersistenceOptions {
  drafts: DraftLoopSelection[];
  context: DraftContext | null; // null when no track is selected
  onSaveDraftSelection: (draft: DraftLoopSelection) => void;
  onClearDraftSelection: (sourceTrackId: string, experimentId?: string) => void;
  // Applies a restored selection to the workspace's own live state — never
  // starts or resumes audio.
  onRestore: (selection: TimelineSelection) => void;
}

export function useDraftSelectionPersistence(opts: UseDraftSelectionPersistenceOptions) {
  const [staleDraft, setStaleDraft] = useState<DraftLoopSelection | null>(null);
  const lastHandledKeyRef = useRef<string | null>(null);

  // §18/§19 — runs once per source/experiment (not on every draft-array
  // change, which would re-fire every time this SAME track's draft is
  // re-saved during normal editing).
  useEffect(() => {
    if (!opts.context) { setStaleDraft(null); lastHandledKeyRef.current = null; return; }
    const key = `${opts.context.sourceTrackId}::${opts.context.experimentId ?? ""}`;
    if (lastHandledKeyRef.current === key) return;
    lastHandledKeyRef.current = key;

    const draft = opts.drafts.find(
      (d) => d.sourceTrackId === opts.context!.sourceTrackId && d.experimentId === opts.context!.experimentId,
    );
    if (!draft) { setStaleDraft(null); return; }

    const stale = isDraftStale(draft, {
      sourceFingerprint: opts.context.sourceFingerprint,
      durationSeconds: opts.context.durationSeconds,
      gridRevisionId: opts.context.gridRevisionId,
      segmentationRevisionId: opts.context.segmentationRevisionId,
    });

    if (stale) { setStaleDraft(draft); return; }
    setStaleDraft(null);

    const sr = opts.context.sampleRate;
    const restored: TimelineSelection = {
      sourceTrackId: draft.sourceTrackId,
      startFrame: draft.startFrame,
      endFrame: draft.endFrame,
      startSeconds: draft.startFrame / sr,
      endSeconds: draft.endFrame / sr,
      durationSeconds: (draft.endFrame - draft.startFrame) / sr,
      source: draft.source,
      snapMode: draft.snapMode,
      candidateId: draft.candidateId,
      segmentId: draft.segmentId,
      createdAt: draft.updatedAt,
      updatedAt: draft.updatedAt,
    };
    opts.onRestore(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.context?.sourceTrackId, opts.context?.experimentId]);

  // §19 — persist when selection committed / boundary changed / label
  // changed / snap mode changed / navigation away occurs. The caller
  // decides WHEN to call this (it's invoked from the relevant handlers and
  // from an unmount effect for "navigation away"); this function only
  // shapes and stamps the draft.
  function saveDraft(selection: TimelineSelection, label?: string) {
    if (!opts.context) return;
    const draft: DraftLoopSelection = {
      sourceTrackId: selection.sourceTrackId,
      experimentId: opts.context.experimentId,
      startFrame: selection.startFrame,
      endFrame: selection.endFrame,
      snapMode: selection.snapMode,
      label,
      source: selection.source === "candidate" || selection.source === "segment" ? selection.source : "manual",
      candidateId: selection.candidateId,
      segmentId: selection.segmentId,
      sourceFingerprintAtSave: opts.context.sourceFingerprint,
      durationSecondsAtSave: opts.context.durationSeconds,
      gridRevisionIdAtSave: opts.context.gridRevisionId,
      segmentationRevisionIdAtSave: opts.context.segmentationRevisionId,
      updatedAt: new Date().toISOString(),
    };
    opts.onSaveDraftSelection(draft);
  }

  function clearDraft() {
    if (!opts.context) return;
    opts.onClearDraftSelection(opts.context.sourceTrackId, opts.context.experimentId);
    setStaleDraft(null);
  }

  return { staleDraft, saveDraft, clearDraft };
}
