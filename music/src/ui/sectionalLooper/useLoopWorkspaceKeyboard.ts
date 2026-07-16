// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §10-§12 —
// keyboard focus model + boundary-editing key table, scoped to this
// component's own mount/unmount (never a branch on App.tsx's global
// transport keydown handler, which is unrelated to looper editing). The
// actual "how far, which direction" math lives in the pure, unit-tested
// logic/loops/keyboardBoundaryEditing.ts — this hook only wires DOM events
// to it and reports when a move was blocked (§12).

import { useEffect, useRef, useState } from "react";
import type { MusicalGrid, SelectionFocusTarget, TimelineSnapMode } from "../../data/loopTypes";
import { computeKeyboardMove } from "../../logic/loops/keyboardBoundaryEditing";

export interface UseLoopWorkspaceKeyboardOptions {
  enabled: boolean;
  hasSelection: boolean;
  startFrame: number | null;
  endFrame: number | null;
  snapMode: TimelineSnapMode;
  grid: MusicalGrid | null;
  sampleRate: number;
  sourceFrameCount: number;
  onMoveBoundary: (which: "start" | "end", newFrame: number) => void;
  onBlocked: () => void;
  onTogglePreview: () => void;
  onApprove: () => void;
  onEscape: () => void;
}

export function useLoopWorkspaceKeyboard(opts: UseLoopWorkspaceKeyboardOptions) {
  const [focusTarget, setFocusTarget] = useState<SelectionFocusTarget>("selection");

  // Latest-ref pattern: `handleKey` always reads `optsRef.current`/
  // `focusTargetRef.current` rather than closing over a specific render's
  // `opts`. Live verification caught the alternative (deps-array-driven
  // resubscribe) going stale: approving a selection changes only its
  // `loopId`, not startFrame/endFrame/snapMode/grid, so the effect never
  // resubscribed, and the NEXT keyboard move ran against a pre-approval
  // `timelineSelection` closure — silently dropping the loopId link an
  // approved selection needs for the revision-confirm check in
  // SectionalLooperWorkspace's commitSelectionChange. Refs make every
  // keypress use the CURRENT values no matter when the listener was
  // attached.
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const focusTargetRef = useRef(focusTarget);
  focusTargetRef.current = focusTarget;

  useEffect(() => {
    if (!opts.enabled) return;

    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // 0716A §"Spacebar Transport" — ignore inside input/textarea/select,
      // any contentEditable field, and any open modal dialog (this
      // workspace's own RevisionConfirmDialog/ActivateRevisionConfirm use
      // role="alertdialog"), not just the three tag names checked before.
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;
      if (target?.closest('[role="dialog"], [role="alertdialog"]')) return;
      const current = optsRef.current;

      if (e.key === " ") { e.preventDefault(); current.onTogglePreview(); return; }
      if (e.key === "Enter") { e.preventDefault(); current.onApprove(); return; }
      if (e.key === "Escape") { e.preventDefault(); current.onEscape(); return; }

      if (!current.hasSelection || current.startFrame == null || current.endFrame == null) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      // §10 — "selection" and "start_boundary" focus both move the start
      // boundary; only "end_boundary" moves the end. Inspector/Loop Bin
      // focus targets are handled by their own native tab order, not here.
      const which: "start" | "end" = focusTargetRef.current === "end_boundary" ? "end" : "start";
      const currentFrame = which === "start" ? current.startFrame : current.endFrame;

      e.preventDefault();
      const next = computeKeyboardMove(
        currentFrame,
        e.key === "ArrowLeft" ? "left" : "right",
        { shift: e.shiftKey, option: e.altKey, meta: e.metaKey || e.ctrlKey },
        current.snapMode, current.grid, current.sampleRate, current.sourceFrameCount,
      );
      if (next === null) { current.onBlocked(); return; }
      current.onMoveBoundary(which, next);
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled]);

  return { focusTarget, setFocusTarget };
}
