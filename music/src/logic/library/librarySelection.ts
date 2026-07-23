// Shared Library data-grid selection resolution — used identically by
// Catalog, External, and Sounds. Every function is pure: given the current
// selection state and the CURRENT visible/ordered row sequence, return the
// next state. The interface layer owns DOM events (click/keydown) and
// translates them into calls here — it never mutates selectedIds/anchor
// itself, so these exact semantics stay independently testable and
// identical across every library that uses the shared grid.
//
// event.altKey is used throughout (never a displayed-key-label check) so
// macOS Option and other platforms' Alt share one behavior.

export interface LibrarySelectionState {
  selectedIds: Set<string>;
  anchorId: string | null;
  focusedId: string | null;
}

export function emptyLibrarySelectionState(): LibrarySelectionState {
  return { selectedIds: new Set(), anchorId: null, focusedId: null };
}

// Inclusive [anchor, target] range in CURRENT visible order. Returns null
// when the anchor (or target) isn't part of the current visible sequence —
// the caller degrades to "apply only to target."
function resolveVisibleRange(visibleOrderedIds: string[], anchorId: string | null, targetId: string): string[] | null {
  if (anchorId == null) return null;
  const anchorIdx = visibleOrderedIds.indexOf(anchorId);
  const targetIdx = visibleOrderedIds.indexOf(targetId);
  if (anchorIdx === -1 || targetIdx === -1) return null;
  const [lo, hi] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
  return visibleOrderedIds.slice(lo, hi + 1);
}

export interface PointerSelectModifiers {
  shift: boolean;
  alt: boolean;
}

// The four pointer gestures (plain / Shift / Option-Alt / Option-Alt+Shift),
// in one resolver so the interface layer has exactly one call site for
// row/checkbox clicks, in any library.
export function resolvePointerSelect(
  state: LibrarySelectionState,
  targetId: string,
  visibleOrderedIds: string[],
  modifiers: PointerSelectModifiers,
): LibrarySelectionState {
  const { shift, alt } = modifiers;

  if (shift && alt) {
    // Option/Alt+Shift — subtract the inclusive anchored range; keep the
    // anchor unchanged so repeated subtractive gestures compound from the
    // same origin.
    const range = resolveVisibleRange(visibleOrderedIds, state.anchorId, targetId);
    if (range == null) {
      const next = new Set(state.selectedIds);
      next.delete(targetId);
      return { selectedIds: next, anchorId: targetId, focusedId: targetId };
    }
    const next = new Set(state.selectedIds);
    range.forEach((id) => next.delete(id));
    return { selectedIds: next, anchorId: state.anchorId, focusedId: targetId };
  }

  if (shift) {
    // Shift — replace selection with the inclusive anchored range.
    const range = resolveVisibleRange(visibleOrderedIds, state.anchorId, targetId);
    if (range == null) {
      return { selectedIds: new Set([targetId]), anchorId: targetId, focusedId: targetId };
    }
    return { selectedIds: new Set(range), anchorId: state.anchorId, focusedId: targetId };
  }

  if (alt) {
    // Option/Alt — toggle only the clicked track, new anchor.
    const next = new Set(state.selectedIds);
    if (next.has(targetId)) next.delete(targetId); else next.add(targetId);
    return { selectedIds: next, anchorId: targetId, focusedId: targetId };
  }

  // Plain click — replace selection with just this track.
  return { selectedIds: new Set([targetId]), anchorId: targetId, focusedId: targetId };
}

// Header checkbox: select all currently-filtered rows when not all are
// selected; clear all currently-filtered rows when all are selected.
// Tracks selected outside the current filter are never touched.
export function resolveHeaderCheckboxToggle(state: LibrarySelectionState, visibleOrderedIds: string[]): LibrarySelectionState {
  const allSelected = visibleOrderedIds.length > 0 && visibleOrderedIds.every((id) => state.selectedIds.has(id));
  const next = new Set(state.selectedIds);
  if (allSelected) {
    visibleOrderedIds.forEach((id) => next.delete(id));
  } else {
    visibleOrderedIds.forEach((id) => next.add(id));
  }
  return { ...state, selectedIds: next };
}

// Cmd/Ctrl+A: always selects every visible row (not a toggle).
export function resolveSelectAllVisible(state: LibrarySelectionState, visibleOrderedIds: string[]): LibrarySelectionState {
  const next = new Set(state.selectedIds);
  visibleOrderedIds.forEach((id) => next.add(id));
  return { ...state, selectedIds: next };
}

// Escape / the action bar's Clear control / clicking genuine empty grid
// space: clears selection and anchor, leaves focus usable.
export function clearLibrarySelection(state: LibrarySelectionState): LibrarySelectionState {
  return { selectedIds: new Set(), anchorId: null, focusedId: state.focusedId };
}

// ArrowUp/ArrowDown: moves focus one visible row; never touches selection.
// direction: -1 = up, 1 = down.
export function moveLibraryFocus(state: LibrarySelectionState, visibleOrderedIds: string[], direction: -1 | 1): LibrarySelectionState {
  if (visibleOrderedIds.length === 0) return state;
  const currentIdx = state.focusedId ? visibleOrderedIds.indexOf(state.focusedId) : -1;
  const nextIdx = currentIdx === -1
    ? (direction === 1 ? 0 : visibleOrderedIds.length - 1)
    : Math.min(visibleOrderedIds.length - 1, Math.max(0, currentIdx + direction));
  return { ...state, focusedId: visibleOrderedIds[nextIdx] };
}

// Space: toggles the focused track while preserving the rest of the
// selection; establishes the focused track as the new anchor.
export function toggleFocusedLibrarySelection(state: LibrarySelectionState): LibrarySelectionState {
  if (state.focusedId == null) return state;
  const next = new Set(state.selectedIds);
  if (next.has(state.focusedId)) next.delete(state.focusedId); else next.add(state.focusedId);
  return { selectedIds: next, anchorId: state.focusedId, focusedId: state.focusedId };
}

// Shift+ArrowUp/Down: moves focus one row, then extends/contracts an
// anchored range through the visible sequence — an anchor is established
// from the PRE-move focused row the first time this runs, then reused for
// subsequent presses so the range grows/shrinks from one origin.
export function extendLibrarySelectionFromFocus(
  state: LibrarySelectionState,
  visibleOrderedIds: string[],
  direction: -1 | 1,
): LibrarySelectionState {
  const previousFocusedId = state.focusedId;
  const moved = moveLibraryFocus(state, visibleOrderedIds, direction);
  if (moved.focusedId == null) return state;
  const anchorId = state.anchorId ?? previousFocusedId ?? moved.focusedId;
  const range = resolveVisibleRange(visibleOrderedIds, anchorId, moved.focusedId);
  if (range == null) {
    return { selectedIds: new Set([moved.focusedId]), anchorId: moved.focusedId, focusedId: moved.focusedId };
  }
  return { selectedIds: new Set(range), anchorId, focusedId: moved.focusedId };
}
