import React, { useCallback, useReducer, useRef } from 'react';
import type {
  WorkingPaletteState,
  WorkingColor,
  StructuralRole,
  InterpretiveRole,
  CleanupPayload,
  SourceCandidatesRecord,
  CommitReason,
} from '../types/palette';
import {
  renameWorkingPalette,
  reorderColor,
  setStructuralRole,
  setInterpretiveRole,
  toggleColorVisibility,
  addColorFromCandidates,
  removeColor,
  commitWorkingPalette,
  validateCommit,
} from '../lib/paletteEditor';
import { saveWorkingPalette, discardWorkingPalette, saveCleanupPayload } from '../lib/paletteStorage';
import { rgbToHex } from '../lib/colorConversion';

const STRUCTURAL_ROLES: StructuralRole[] = ['base', 'support', 'accent', 'separator', 'signal'];
const INTERPRETIVE_ROLES: InterpretiveRole[] = [
  'warm', 'cool', 'nocturnal', 'synthetic', 'environmental', 'muted', 'vibrant', 'industrial', 'neutral'
];

// ─── Undo/redo ─────────────────────────────────────────────────────────────────
// Operates inside WORKING_PALETTE only — may NEVER affect committed revisions.

interface UndoState {
  history: WorkingPaletteState[];
  pointer: number;
}

type UndoAction =
  | { type: 'push'; state: WorkingPaletteState }
  | { type: 'undo' }
  | { type: 'redo' };

function undoReducer(s: UndoState, action: UndoAction): UndoState {
  switch (action.type) {
    case 'push': {
      const newHistory = s.history.slice(0, s.pointer + 1).concat(action.state);
      return { history: newHistory, pointer: newHistory.length - 1 };
    }
    case 'undo':
      return s.pointer > 0 ? { ...s, pointer: s.pointer - 1 } : s;
    case 'redo':
      return s.pointer < s.history.length - 1 ? { ...s, pointer: s.pointer + 1 } : s;
    default:
      return s;
  }
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialWorking: WorkingPaletteState;
  cleanupPayload: CleanupPayload | null;
  sourceRecord: SourceCandidatesRecord | null;
  onCommitted: () => void;
  onDiscard: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDark(color: WorkingColor['rgb']): boolean {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114 < 128;
}

function candidateIndexFromRef(ref: string): number | null {
  const m = ref.match(/:candidate_(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaletteWorkingEditor({
  initialWorking,
  cleanupPayload,
  sourceRecord,
  onCommitted,
  onDiscard,
}: Props) {
  const [undo, dispatch] = useReducer(undoReducer, {
    history: [initialWorking],
    pointer: 0,
  });

  const working = undo.history[undo.pointer];
  const canUndo = undo.pointer > 0;
  const canRedo = undo.pointer < undo.history.length - 1;

  const [committing, setCommitting] = React.useState(false);
  const [commitError, setCommitError] = React.useState<string | null>(null);
  const [showExcluded, setShowExcluded] = React.useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Push updated state onto undo stack and auto-save
  const apply = useCallback((next: WorkingPaletteState) => {
    dispatch({ type: 'push', state: next });
    saveWorkingPalette(next).catch(() => {});
  }, []);

  const sortedColors = [...working.workingColors].sort((a, b) => a.order - b.order);

  const handleCommit = useCallback(async (reason: CommitReason) => {
    setCommitError(null);
    const errors = validateCommit(working);
    if (errors.length > 0) { setCommitError(errors.join(', ')); return; }
    setCommitting(true);
    try {
      const revision = await commitWorkingPalette(working, reason);
      // Store cleanup payload with finalized palette + revision IDs
      if (cleanupPayload) {
        await saveCleanupPayload({
          ...cleanupPayload,
          paletteId: revision.palette_id,
          revisionId: revision.id,
        });
      }
      await discardWorkingPalette(working.id);
      onCommitted();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : 'Commit failed.');
    } finally {
      setCommitting(false);
    }
  }, [working, cleanupPayload, onCommitted]);

  const handleDiscard = useCallback(async () => {
    await discardWorkingPalette(working.id);
    onDiscard();
  }, [working.id, onDiscard]);

  // Build excluded color list with source candidate data
  const excludedWithData = React.useMemo(() => {
    if (!cleanupPayload || !sourceRecord) return [];
    return cleanupPayload.excludedColors.map(ex => {
      const idx = candidateIndexFromRef(ex.candidateRef);
      const candidate = idx !== null ? sourceRecord.candidateColors[idx] : null;
      const alreadyPresent = working.workingColors.some(c => c.candidateRef === ex.candidateRef);
      return { ...ex, candidate, alreadyPresent };
    }).filter(ex => ex.candidate !== null);
  }, [cleanupPayload, sourceRecord, working.workingColors]);

  return (
    <div className="working-editor">
      {/* ── Header ── */}
      <div className="working-editor__header">
        <button className="btn btn--ghost btn--sm" onClick={handleDiscard}>← Discard</button>
        <input
          ref={nameRef}
          className="working-editor__name"
          value={working.name}
          onChange={e => apply(renameWorkingPalette(working, e.target.value))}
          placeholder="Palette name"
        />
        <div className="working-editor__header-actions">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => dispatch({ type: 'undo' })}
            disabled={!canUndo}
            title="Undo"
          >↩</button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => dispatch({ type: 'redo' })}
            disabled={!canRedo}
            title="Redo"
          >↪</button>
          <button
            className="btn btn--primary"
            onClick={() => handleCommit('manual_refinement')}
            disabled={committing}
          >
            {committing ? 'Committing…' : 'Commit revision'}
          </button>
        </div>
      </div>
      {commitError && <p className="working-editor__error">{commitError}</p>}

      <div className="working-editor__body">
        {/* ── Working colors ── */}
        <div className="working-editor__colors">
          <span className="working-editor__section-label">
            Working colors · {sortedColors.filter(c => c.visible).length} visible
          </span>
          {sortedColors.map((c, i) => {
            const bg = `rgb(${c.rgb.r},${c.rgb.g},${c.rgb.b})`;
            const dark = isDark(c.rgb);
            return (
              <div
                key={c.candidateRef}
                className={`color-row${!c.visible ? ' color-row--hidden' : ''}`}
              >
                {/* Order controls */}
                <div className="color-row__order">
                  <button
                    className="order-btn"
                    onClick={() => apply(reorderColor(working, c.order, c.order - 1))}
                    disabled={i === 0}
                    title="Move up"
                  >▲</button>
                  <button
                    className="order-btn"
                    onClick={() => apply(reorderColor(working, c.order, c.order + 1))}
                    disabled={i === sortedColors.length - 1}
                    title="Move down"
                  >▼</button>
                </div>

                {/* Swatch */}
                <div className="color-row__swatch" style={{ background: bg }}>
                  <span style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)', fontSize: 9, fontFamily: 'monospace' }}>
                    {c.hex.toUpperCase()}
                  </span>
                </div>

                {/* Role selectors */}
                <select
                  className="role-select"
                  value={c.structuralRole}
                  onChange={e => apply(setStructuralRole(working, c.candidateRef, e.target.value as StructuralRole))}
                  title="Structural role"
                >
                  {STRUCTURAL_ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <select
                  className="role-select"
                  value={c.interpretiveRole}
                  onChange={e => apply(setInterpretiveRole(working, c.candidateRef, e.target.value as InterpretiveRole))}
                  title="Interpretive role"
                >
                  {INTERPRETIVE_ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                {/* Visibility + Remove */}
                <button
                  className={`icon-btn${c.visible ? '' : ' icon-btn--muted'}`}
                  onClick={() => apply(toggleColorVisibility(working, c.candidateRef))}
                  title={c.visible ? 'Hide' : 'Show'}
                >
                  {c.visible ? '👁' : '◌'}
                </button>
                <button
                  className="icon-btn icon-btn--danger"
                  onClick={() => apply(removeColor(working, c.candidateRef))}
                  title="Remove from palette"
                >✕</button>
              </div>
            );
          })}
        </div>

        {/* ── Excluded candidates panel ── */}
        {excludedWithData.length > 0 && (
          <div className="working-editor__candidates">
            <button
              className="working-editor__section-label working-editor__section-label--btn"
              onClick={() => setShowExcluded(v => !v)}
            >
              {showExcluded ? '▾' : '▸'} Suppressed candidates ({excludedWithData.length})
            </button>
            {showExcluded && (
              <div className="candidate-list">
                {excludedWithData.map(ex => {
                  if (!ex.candidate) return null;
                  const { rgb } = ex.candidate;
                  const bg = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
                  return (
                    <div key={ex.candidateRef} className="candidate-row">
                      <div className="candidate-row__swatch" style={{ background: bg }} />
                      <span className="candidate-row__hex">{ex.candidate.hex.toUpperCase()}</span>
                      <span className="candidate-row__reason">{ex.suppressionReason.replace('_', ' ')}</span>
                      {ex.deltaE && (
                        <span className="candidate-row__de">ΔE {ex.deltaE}</span>
                      )}
                      <button
                        className="btn btn--ghost btn--sm"
                        disabled={ex.alreadyPresent}
                        onClick={() => apply(addColorFromCandidates(working, {
                          candidateRef: ex.candidateRef,
                          hex: ex.candidate!.hex,
                          rgb: ex.candidate!.rgb,
                          lab: ex.candidate!.lab,
                          frequency: ex.candidate!.frequency,
                        }))}
                      >
                        {ex.alreadyPresent ? 'Added' : '+ Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom action bar ── */}
      <div className="working-editor__footer">
        <span className="working-editor__lifecycle">WORKING_PALETTE · r{working.workingColors.length} colors</span>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => handleCommit('role_adjustment')}
          disabled={committing}
        >
          Commit as role edit
        </button>
      </div>
    </div>
  );
}
