/**
 * Palette Editor — v1.1.0
 *
 * Authorial refinement infrastructure for CURATED_PALETTE revisions.
 *
 * The editor operates on WORKING_PALETTE governed state — NOT ephemeral UI.
 * All edits are staged; committed as new immutable revisions.
 * SOURCE_CANDIDATES and historical revisions are never mutated.
 */

import type {
  PaletteRevision,
  CleanupPayload,
  WorkingPaletteState,
  WorkingColor,
  StructuralRole,
  InterpretiveRole,
  CommitReason,
  PaletteSwatch,
} from '../types/palette';
import { rgbToLab } from './colorConversion';
import { appendRevisionRaw } from './paletteStorage';

export const EDITOR_VERSION = '1.1.0';

// ─── Create WORKING_PALETTE from a committed revision ─────────────────────────

/**
 * Open a WORKING_PALETTE state from a CURATED_PALETTE revision.
 * Enriches with role data from cleanup payload when available.
 *
 * INVARIANT: workingColors retain candidateRef from source swatch or cleanup.
 * INVARIANT: source_candidates_ref and parentRevisionId preserved.
 */
export function createWorkingPalette(
  revision: PaletteRevision,
  cleanupPayload: CleanupPayload | null,
): WorkingPaletteState {
  // Build role lookup keyed by candidateRef (stable) falling back to hex
  const roleByRef = new Map(
    cleanupPayload?.curatedColors.map(c => [c.candidateRef, c]) ?? []
  );
  const roleByHex = new Map(
    cleanupPayload?.curatedColors.map(c => [c.hex.toLowerCase(), c]) ?? []
  );

  const workingColors: WorkingColor[] = revision.swatches.map((swatch, i) => {
    const role =
      (swatch.candidateRef ? roleByRef.get(swatch.candidateRef) : undefined) ??
      roleByHex.get(swatch.hex.toLowerCase());

    return {
      candidateRef: swatch.candidateRef ??
        `${revision.source_candidates_ref}:manual_${swatch.id}`,
      hex: swatch.hex,
      authoredHex: null,
      authoredLab: null,
      rgb: swatch.color,
      lab: role?.lab ?? rgbToLab(swatch.color),
      structuralRole: role?.structuralRole ?? 'support',
      interpretiveRole: role?.interpretiveRole ?? 'neutral',
      visible: true,
      order: i,
    };
  });

  return {
    id: crypto.randomUUID(),
    paletteId: revision.palette_id,
    source_candidates_ref: revision.source_candidates_ref,
    parentRevisionId: revision.id,
    lifecycleState: 'WORKING_PALETTE',
    provenance: {
      openedAt: new Date().toISOString(),
      editorVersion: EDITOR_VERSION,
      createdFromRevisionId: revision.id,
    },
    name: revision.name,
    workingColors,
    savedAt: Date.now(),
  };
}

// ─── Working state operations ─────────────────────────────────────────────────
// All operations return a new WorkingPaletteState (immutable update pattern).
// Callers push each result onto their undo stack.

export function renameWorkingPalette(
  w: WorkingPaletteState,
  name: string,
): WorkingPaletteState {
  return { ...w, name, savedAt: Date.now() };
}

export function reorderColor(
  w: WorkingPaletteState,
  fromOrder: number,
  toOrder: number,
): WorkingPaletteState {
  if (fromOrder === toOrder) return w;
  const colors = [...w.workingColors].map(c => ({ ...c }));
  const moving = colors.find(c => c.order === fromOrder);
  const target = colors.find(c => c.order === toOrder);
  if (!moving || !target) return w;
  moving.order = toOrder;
  target.order = fromOrder;
  return { ...w, workingColors: colors, savedAt: Date.now() };
}

export function setStructuralRole(
  w: WorkingPaletteState,
  candidateRef: string,
  role: StructuralRole,
): WorkingPaletteState {
  return {
    ...w,
    savedAt: Date.now(),
    workingColors: w.workingColors.map(c =>
      c.candidateRef === candidateRef ? { ...c, structuralRole: role } : c
    ),
  };
}

export function setInterpretiveRole(
  w: WorkingPaletteState,
  candidateRef: string,
  role: InterpretiveRole,
): WorkingPaletteState {
  return {
    ...w,
    savedAt: Date.now(),
    workingColors: w.workingColors.map(c =>
      c.candidateRef === candidateRef ? { ...c, interpretiveRole: role } : c
    ),
  };
}

export function toggleColorVisibility(
  w: WorkingPaletteState,
  candidateRef: string,
): WorkingPaletteState {
  return {
    ...w,
    savedAt: Date.now(),
    workingColors: w.workingColors.map(c =>
      c.candidateRef === candidateRef ? { ...c, visible: !c.visible } : c
    ),
  };
}

/**
 * Add a color from SOURCE_CANDIDATES excluded list back into the working palette.
 * INVARIANT: candidateRef preserves stable extraction lineage.
 */
export function addColorFromCandidates(
  w: WorkingPaletteState,
  color: { candidateRef: string; hex: string; rgb: import('../types/palette').RGBColor; lab: import('../types/palette').LABColor; frequency: number },
): WorkingPaletteState {
  // Reject if already present
  if (w.workingColors.some(c => c.candidateRef === color.candidateRef)) return w;

  const maxOrder = Math.max(-1, ...w.workingColors.map(c => c.order));
  const newColor: WorkingColor = {
    candidateRef: color.candidateRef,
    hex: color.hex,
    authoredHex: null,
    authoredLab: null,
    rgb: color.rgb,
    lab: color.lab,
    structuralRole: 'support',
    interpretiveRole: 'neutral',
    visible: true,
    order: maxOrder + 1,
  };

  return { ...w, workingColors: [...w.workingColors, newColor], savedAt: Date.now() };
}

export function removeColor(
  w: WorkingPaletteState,
  candidateRef: string,
): WorkingPaletteState {
  return {
    ...w,
    savedAt: Date.now(),
    workingColors: w.workingColors.filter(c => c.candidateRef !== candidateRef),
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate before commit. Failed validation must block commit.
 */
export function validateCommit(working: WorkingPaletteState): string[] {
  const errors: string[] = [];
  if (!working.source_candidates_ref) errors.push('source_candidates_ref missing');
  if (!working.parentRevisionId)       errors.push('parentRevisionId missing');
  if (!working.name.trim())            errors.push('Palette name required');
  const visible = working.workingColors.filter(c => c.visible);
  if (visible.length === 0)            errors.push('At least one visible color required');
  // All colors must retain candidateRef (extraction lineage)
  const missingRef = working.workingColors.some(c => !c.candidateRef);
  if (missingRef)                      errors.push('One or more colors missing candidateRef');
  return errors;
}

// ─── Commit ───────────────────────────────────────────────────────────────────

/**
 * Commit a WORKING_PALETTE as a new immutable CURATED_PALETTE revision.
 *
 * INVARIANT: creates new revision — does NOT overwrite parentRevision.
 * INVARIANT: source_candidates_ref propagates to new revision.
 * INVARIANT: commit provenance recorded on revision.
 */
export async function commitWorkingPalette(
  working: WorkingPaletteState,
  reason: CommitReason,
  note?: string,
): Promise<PaletteRevision> {
  const errors = validateCommit(working);
  if (errors.length > 0) {
    throw new Error(`Commit validation failed: ${errors.join('; ')}`);
  }

  const swatches: PaletteSwatch[] = working.workingColors
    .filter(c => c.visible)
    .sort((a, b) => a.order - b.order)
    .map(c => ({
      id: crypto.randomUUID(),
      color: c.rgb,
      hex: c.authoredHex ?? c.hex,
      candidateRef: c.candidateRef,
    }));

  const commitProvenance = {
    committedAt: new Date().toISOString(),
    editorVersion: EDITOR_VERSION,
    commitReason: reason,
  };
  const editSummary = note ? { note } : undefined;

  return appendRevisionRaw(
    working.paletteId,
    working.source_candidates_ref,
    working.name,
    swatches,
    'CURATED_PALETTE',
    working.parentRevisionId,
    undefined,
    undefined,
    false,
    commitProvenance,
    editSummary,
  );
}
