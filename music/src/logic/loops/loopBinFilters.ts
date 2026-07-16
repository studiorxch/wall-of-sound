// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §27-§31 — pure
// Loop Bin row construction, tab counts, filtering, and sorting. Consumes
// plain descriptors rather than component state directly, so it stays
// decoupled from SectionalLooperWorkspace.tsx and unit-testable.

import type {
  LoopAsset, LoopBinFilters, LoopBinRow, LoopBinSortKey, LoopBinTab, LoopCandidateGenerationMode,
} from "../../data/loopTypes";

export interface LoopBinLoopInput {
  loop: LoopAsset;
  isStale: boolean;
  // From the loop's LoopRenderRecord (via getLoopRenderRecord), if any —
  // this module never looks that up itself, it only shapes what it's given.
  renderStatus?: string;
  // 0715E §20 — precomputed display hints (parent-track lookup and revision
  // timeline are both stateful lookups the caller already has in scope;
  // this module stays a pure shaper, not a second place those are resolved).
  parentTrackTitle?: string;
  revisionLabel?: string;
}

export interface LoopBinCandidateInput {
  candidateId: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  sectionLabel?: string;
  sourceKind: "track" | "stem";
  generationMode?: LoopCandidateGenerationMode;
  decision?: "approved" | "rejected";
  // 0715D — live-caught real defect: without this, a bar-aligned candidate's
  // lengthLabel was always formatted in seconds (never "N bars"), so the
  // §28 Length filter could never match ANY suggestion row, even an exact
  // 8-bar candidate. Optional because time-based/provisional candidates
  // genuinely have no whole-bar count.
  barCount?: number;
}

function formatLengthLabel(durationSeconds: number, barCount?: number): string {
  if (barCount) return `${Math.round(barCount)} bars`;
  return `${durationSeconds.toFixed(2)}s`;
}

// §30 — builds the compact row model. A candidate already represented by
// an approved LoopAsset is skipped here (it shows once, as the loop row,
// not twice).
export function buildLoopBinRows(
  loopInputs: LoopBinLoopInput[],
  candidateInputs: LoopBinCandidateInput[],
  sampleRate: number,
): LoopBinRow[] {
  const rows: LoopBinRow[] = [];

  for (const { loop, isStale, renderStatus, parentTrackTitle, revisionLabel } of loopInputs) {
    if (loop.status !== "approved") continue;
    rows.push({
      id: `loop_${loop.id}`,
      loopId: loop.id,
      title: loop.title,
      startFrame: Math.round(loop.startSeconds * sampleRate),
      endFrame: Math.round(loop.endSeconds * sampleRate),
      lengthLabel: formatLengthLabel(loop.durationSeconds, loop.barCount),
      sectionLabel: loop.sectionLabel,
      status: isStale ? "stale" : "approved",
      renderStatus,
      sourceKind: loop.sourceKind === "stem" ? "stem" : "track",
      generationMode: loop.generationMode,
      score: loop.seamlessnessScore,
      createdAt: loop.createdAt,
      updatedAt: loop.updatedAt,
      parentTrackTitle,
      revisionLabel,
    });
  }

  for (const c of candidateInputs) {
    if (c.decision === "approved") continue;
    rows.push({
      id: `cand_${c.candidateId}`,
      candidateId: c.candidateId,
      title: c.title,
      startFrame: Math.round(c.startSeconds * sampleRate),
      endFrame: Math.round(c.endSeconds * sampleRate),
      lengthLabel: formatLengthLabel(c.endSeconds - c.startSeconds, c.barCount),
      sectionLabel: c.sectionLabel,
      status: c.decision === "rejected" ? "rejected" : "suggestion",
      sourceKind: c.sourceKind,
      generationMode: c.generationMode,
    });
  }

  return rows;
}

export function tabForRow(row: LoopBinRow): LoopBinTab {
  if (row.status === "approved") return "approved";
  if (row.status === "stale") return "stale";
  if (row.status === "rejected") return "rejected";
  return "suggestions";
}

// §27 — per-tab counts.
export function countsByTab(rows: LoopBinRow[]): Record<LoopBinTab, number> {
  const counts: Record<LoopBinTab, number> = { approved: 0, suggestions: 0, rejected: 0, stale: 0 };
  for (const row of rows) counts[tabForRow(row)]++;
  return counts;
}

const MODE_MATCH: Record<NonNullable<LoopBinFilters["mode"]>, LoopCandidateGenerationMode[]> = {
  trusted: ["trusted_grid"],
  provisional: ["provisional_grid"],
  time_based: ["time_fallback"],
  manual: ["manual_only"],
};

function matchesLengthFilter(row: LoopBinRow, length: NonNullable<LoopBinFilters["length"]>): boolean {
  const match = row.lengthLabel.match(/^(\d+)\s*bars$/);
  if (length === "free") return !match;
  return !!match && Number(match[1]) === length;
}

// §28 — Length/Section/Mode/Render/Source filters, applied within a tab.
export function filterLoopBinRows(rows: LoopBinRow[], tab: LoopBinTab, filters: LoopBinFilters): LoopBinRow[] {
  return rows.filter((row) => {
    if (tabForRow(row) !== tab) return false;
    if (filters.source && row.sourceKind !== filters.source) return false;
    if (filters.length && !matchesLengthFilter(row, filters.length)) return false;
    if (filters.render) {
      const rs = row.renderStatus ?? "not_rendered";
      if (rs !== filters.render) return false;
    }
    if (filters.mode) {
      if (!row.generationMode || !MODE_MATCH[filters.mode].includes(row.generationMode)) return false;
    }
    if (filters.section) {
      if (filters.section === "segment") {
        if (!row.sectionLabel) return false;
      } else if ((row.sectionLabel ?? "").toLowerCase() !== filters.section) {
        return false;
      }
    }
    return true;
  });
}

// §29 — sort keys. Score/Created/Updated rely on the additive row fields
// (see loopTypes.ts's LoopBinRow doc comment); rows lacking that data sort
// last rather than being fabricated a position.
export function sortLoopBinRows(rows: LoopBinRow[], sort: LoopBinSortKey): LoopBinRow[] {
  const sorted = [...rows];
  const byMaybeNumber = (get: (r: LoopBinRow) => number | undefined, desc = false) =>
    (a: LoopBinRow, b: LoopBinRow) => {
      const av = get(a); const bv = get(b);
      if (av === undefined && bv === undefined) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return desc ? bv - av : av - bv;
    };
  switch (sort) {
    case "start_time":
      sorted.sort((a, b) => a.startFrame - b.startFrame);
      break;
    case "length":
      sorted.sort((a, b) => (a.endFrame - a.startFrame) - (b.endFrame - b.startFrame));
      break;
    case "score":
      sorted.sort(byMaybeNumber((r) => r.score, true));
      break;
    case "created":
      sorted.sort(byMaybeNumber((r) => (r.createdAt ? Date.parse(r.createdAt) : undefined)));
      break;
    case "updated":
      sorted.sort(byMaybeNumber((r) => (r.updatedAt ? Date.parse(r.updatedAt) : undefined), true));
      break;
    case "name":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
  }
  return sorted;
}
