// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §10.1 — a
// hand-rolled row-windowing calculation for the 25-50 row multi-track prep
// stack. No virtualization library exists anywhere in this codebase, and
// this row count doesn't warrant adding one. Pure — no DOM.
//
// `forceIncludeIndex` is the currently-expanded row: it must always appear
// in the rendered slice regardless of scroll position, so an in-progress
// edit is never unmounted by a scroll event.

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface VisibleRowRange {
  startIndex: number;
  endIndex: number; // exclusive
}

export function computeVisibleRowRange(
  scrollTop: number,
  containerHeight: number,
  rowHeight: number,
  totalRows: number,
  overscan: number = 0,
  forceIncludeIndex: number | null = null,
): VisibleRowRange {
  if (totalRows <= 0 || rowHeight <= 0 || containerHeight <= 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const firstVisible = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(containerHeight / rowHeight);

  let startIndex = clamp(firstVisible - overscan, 0, totalRows - 1);
  let endIndex = clamp(firstVisible + visibleCount + overscan, startIndex + 1, totalRows);

  if (forceIncludeIndex != null && forceIncludeIndex >= 0 && forceIncludeIndex < totalRows) {
    if (forceIncludeIndex < startIndex) startIndex = forceIncludeIndex;
    if (forceIncludeIndex >= endIndex) endIndex = forceIncludeIndex + 1;
  }

  return { startIndex, endIndex };
}
