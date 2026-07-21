// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §3/§6/§11 — RADIO
// Playlists is now a received-only card grid: no embedded "MUSIC
// Playlists" table, no inline Send button, no `playlists` prop at all.
// Every card renders purely from its own RadioPlaylist's send-time
// snapshot (title/coverImage/accentColor/durationSeconds — never a live
// MUSIC lookup). Sending now happens exclusively from MUSIC's own
// playlist cards/detail (App.tsx's handleSendPlaylistToRadioClick).

import { useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist, RadioEntryPreparationState } from "../../data/radioPlaylistTypes";
import type { RadioWebExportRecord } from "../../data/radioWebBundleTypes";
import { radioPlaylistStateLabel } from "../../logic/radio/radioPlaylistPublicationState";
import { buildPublishPreview } from "../../logic/radio/radioPublishPreview";
import { RadioMultiTrackPrepWorkspace, type RadioLooperSharedProps } from "./RadioMultiTrackPrepWorkspace";
import { RadioPlaylistPublishPanel } from "./RadioPlaylistPublishPanel";

// The card grid has no live per-entry verification pass of its own (that
// only runs once inside the prep workspace/panel, the ONE place that owns
// it — see RadioMultiTrackPrepWorkspace.tsx) — an empty map here is
// intentional: buildPublishPreview/computeEntryPreparationState fall back
// to trusting each entry's persisted approval/binding, which is honest
// enough for a summary badge.
const NO_LIVE_PREPARATION_STATES: Map<string, RadioEntryPreparationState> = new Map();

function fmtDur(secs: number | undefined): string {
  if (!secs || secs <= 0) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

interface Props {
  radioPlaylists: RadioPlaylist[];
  radioInboxItems: RadioInboxItem[];
  libraryTracks: Track[];
  songAnalyses: CompleteSongAnalysis[];
  radioWebExports: RadioWebExportRecord[];
  onUpdateRadioPlaylist: (id: string, patch: Partial<RadioPlaylist>) => void;
  onUpdateRadioInboxItem: (id: string, patch: Partial<RadioInboxItem>) => void;
  onExportWebBundle: (record: RadioWebExportRecord) => void;
  looperShared: RadioLooperSharedProps;
  onOpenLoopchainPlayer?: (candidateSourceTrackIds: string[]) => void;
}

export function RadioPlaylistsView({
  radioPlaylists, radioInboxItems, libraryTracks, songAnalyses, radioWebExports,
  onUpdateRadioPlaylist, onUpdateRadioInboxItem, onExportWebBundle, looperShared, onOpenLoopchainPlayer,
}: Props) {
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const [publishPanelPlaylistId, setPublishPanelPlaylistId] = useState<string | null>(null);

  const openPlaylist = openPlaylistId ? radioPlaylists.find((rp) => rp.id === openPlaylistId) ?? null : null;
  if (openPlaylist) {
    return (
      <RadioMultiTrackPrepWorkspace
        radioPlaylist={openPlaylist}
        allRadioPlaylists={radioPlaylists}
        radioInboxItems={radioInboxItems}
        libraryTracks={libraryTracks}
        songAnalyses={songAnalyses}
        radioWebExports={radioWebExports}
        onUpdateRadioPlaylist={onUpdateRadioPlaylist}
        onUpdateRadioInboxItem={onUpdateRadioInboxItem}
        onExportWebBundle={onExportWebBundle}
        looperShared={looperShared}
        onBack={() => setOpenPlaylistId(null)}
        onOpenLoopchainPlayer={onOpenLoopchainPlayer}
      />
    );
  }

  const publishPanelPlaylist = publishPanelPlaylistId ? radioPlaylists.find((rp) => rp.id === publishPanelPlaylistId) ?? null : null;

  return (
    <div className="radio-playlists-view">
      <h2>RADIO Playlists</h2>

      {radioPlaylists.length === 0 ? (
        <div className="radio-dashboard-empty">Nothing has been sent to RADIO yet.</div>
      ) : (
        <div className="pg-grid radio-playlist-grid">
          {radioPlaylists.map((rp) => {
            // 0718B — "ready" now means "ready for Web Bundle export"
            // (approved + prepared + bound), not merely analysis-complete.
            const readyCount = buildPublishPreview(rp, radioInboxItems).ready.length;
            const lockedCount = rp.entries.filter((e) => e.locked).length;
            return (
              <div className="pgc radio-playlist-card" key={rp.id} onClick={() => setOpenPlaylistId(rp.id)}>
                <div className="pgc-art" style={{ background: rp.accentColor ?? "var(--surface3)" }}>
                  {rp.coverImage?.src ? <img src={rp.coverImage.src} alt={rp.title} className="pgc-art-img" /> : <span className="pgc-art-initials">♫</span>}
                </div>
                <span className="pgc-count-badge">{rp.entries.length}</span>
                <div className="pgc-info">
                  <span className="pgc-title">{rp.title}</span>
                  <span className="pgc-badges-row">
                    <span className="pgc-dur">{fmtDur(rp.durationSeconds)}</span>
                    <span className="radio-badge radio-badge-ready">{readyCount}/{rp.entries.length} ready</span>
                    {lockedCount > 0 && <span className="radio-badge radio-badge-unprepared">{lockedCount} locked</span>}
                  </span>
                  <span className="pgc-updated">{radioPlaylistStateLabel(rp.state)} · v{rp.version}</span>
                </div>
                <div className="pgc-hover-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="pgc-ha-btn" title="Open" onClick={() => setOpenPlaylistId(rp.id)}>Open</button>
                  <button className="pgc-ha-btn" title="Publication tracking" onClick={() => setPublishPanelPlaylistId(rp.id)}>Publish…</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {publishPanelPlaylist && (
        <RadioPlaylistPublishPanel
          radioPlaylist={publishPanelPlaylist}
          allRadioPlaylists={radioPlaylists}
          radioInboxItems={radioInboxItems}
          libraryTracks={libraryTracks}
          loops={looperShared.loops}
          preparationStateByEntryId={NO_LIVE_PREPARATION_STATES}
          radioWebExports={radioWebExports}
          onUpdateRadioPlaylist={onUpdateRadioPlaylist}
          onUpdateRadioInboxItem={onUpdateRadioInboxItem}
          onPromoteToRadio={looperShared.onPromoteToRadio}
          onExportedWebBundle={onExportWebBundle}
          onClose={() => setPublishPanelPlaylistId(null)}
        />
      )}
    </div>
  );
}
