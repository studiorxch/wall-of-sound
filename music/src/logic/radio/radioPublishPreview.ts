// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §14.4, reworked by
// 0718B_RADIO_Web_Publication_Asset_Export_Bridge §Architecture decision 8
// — the Publication Tracking preview. The old three-way
// alreadyPublished/needsPromotion/excluded split (loop-promotion-centric)
// is replaced by the real five-category classification a full-track Web
// Bundle export actually needs: Ready / Needs approval / Needs
// preparation / Stale-or-failed / Excluded — driven by
// computeEntryPreparationState (radioEntryPreparation.ts), the SAME
// classifier the prep workspace and export preflight use, so this preview
// can never disagree with what "Export Web Bundle…" will actually do.
//
// Loop-kind entries with an already-published legacyRadioLoopId (the
// pre-0718B RadioLoop performance-asset path) are surfaced separately as
// `performanceAssets` — informational only, and NEVER gates readiness
// (spec Product decision: RadioLoops are optional; a complete track is
// the required baseline). A loop-kind entry with no legacyRadioLoopId yet
// still has no path through THIS build's five categories (full-track
// packaging is the only encoder this build adds) — it's excluded with an
// honest, named reason rather than silently vanishing.

import type { RadioPlaylist, RadioEntryPreparationState } from "../../data/radioPlaylistTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import { computeEntryPreparationState } from "./radioEntryPreparation";
import { kindHasPackagingPath } from "./radioAssetReadiness";

export interface RadioPublishPreviewEntry {
  entryId: string;
  inboxItemId: string;
  reason?: string;
}

export interface RadioPublishPerformanceAsset {
  entryId: string;
  inboxItemId: string;
  radioLoopId: string;
}

export interface RadioPublishPreview {
  ready: RadioPublishPreviewEntry[];
  needsApproval: RadioPublishPreviewEntry[];
  needsPreparation: RadioPublishPreviewEntry[];
  staleOrFailed: RadioPublishPreviewEntry[];
  excluded: RadioPublishPreviewEntry[];
  // Optional RadioLoop performance assets — never gates any category above.
  performanceAssets: RadioPublishPerformanceAsset[];
}

// `entryStates` lets a live-verified state (fetched via /radio-track-verify
// for bound entries) take precedence; any entry not present in the map
// falls back to computeEntryPreparationState's own no-live-check default
// (trusting the persisted approval/binding — see radioEntryPreparation.ts).
export function buildPublishPreview(
  radioPlaylist: RadioPlaylist,
  inboxItems: RadioInboxItem[],
  entryStates: Map<string, RadioEntryPreparationState> = new Map(),
): RadioPublishPreview {
  const inboxItemById = new Map(inboxItems.map((i) => [i.id, i]));

  const ready: RadioPublishPreviewEntry[] = [];
  const needsApproval: RadioPublishPreviewEntry[] = [];
  const needsPreparation: RadioPublishPreviewEntry[] = [];
  const staleOrFailed: RadioPublishPreviewEntry[] = [];
  const excluded: RadioPublishPreviewEntry[] = [];
  const performanceAssets: RadioPublishPerformanceAsset[] = [];

  for (const entry of radioPlaylist.entries) {
    const item = inboxItemById.get(entry.inboxItemId);

    if (item?.legacyRadioLoopId) {
      performanceAssets.push({ entryId: entry.id, inboxItemId: item.id, radioLoopId: item.legacyRadioLoopId });
    }

    if (!entry.includedInPublish) {
      excluded.push({ entryId: entry.id, inboxItemId: entry.inboxItemId, reason: "Entry excluded from publish" });
      continue;
    }
    if (!item) {
      excluded.push({ entryId: entry.id, inboxItemId: entry.inboxItemId, reason: "Source Inbox item missing" });
      continue;
    }
    if (!kindHasPackagingPath(item.kind)) {
      excluded.push({ entryId: entry.id, inboxItemId: item.id, reason: `Kind "${item.kind}" has no verified packaging path yet` });
      continue;
    }
    if (item.kind === "loop") {
      // Already accounted for above (as a performance asset) when
      // published; otherwise it has no path through this build's
      // full-track categories — the legacy RadioLoop promotion flow is
      // untouched but is not what "Export Web Bundle…" consumes.
      if (!item.legacyRadioLoopId) {
        excluded.push({ entryId: entry.id, inboxItemId: item.id, reason: "Loop-kind entries publish via the separate RadioLoop performance-asset flow" });
      }
      continue;
    }

    const state = entryStates.get(entry.id) ?? computeEntryPreparationState({ entry });
    switch (state) {
      case "EXCLUDED":
        excluded.push({ entryId: entry.id, inboxItemId: item.id, reason: "Entry excluded from publish" });
        break;
      case "NOT_APPROVED":
        needsApproval.push({ entryId: entry.id, inboxItemId: item.id });
        break;
      case "NEEDS_PREPARATION":
        needsPreparation.push({ entryId: entry.id, inboxItemId: item.id });
        break;
      case "PREPARING":
        needsPreparation.push({ entryId: entry.id, inboxItemId: item.id, reason: "Preparing…" });
        break;
      case "STALE":
        staleOrFailed.push({ entryId: entry.id, inboxItemId: item.id, reason: "Stale — needs re-preparation" });
        break;
      case "FAILED":
        staleOrFailed.push({ entryId: entry.id, inboxItemId: item.id, reason: entry.lastPreparationError?.message ?? "Preparation failed" });
        break;
      case "READY":
        ready.push({ entryId: entry.id, inboxItemId: item.id });
        break;
    }
  }

  return { ready, needsApproval, needsPreparation, staleOrFailed, excluded, performanceAssets };
}
