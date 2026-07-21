// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §2/§7/§8 — the
// RADIO Dashboard: replaces both the old Inbox-only landing screen and the
// deleted RadioWorkspace tab shell. Renders ENTIRELY from active
// (non-dismissed) receipts resolved via radioDashboardSummary.ts — never
// from live playlist/bank association state. A playlist/bank send never
// visually explodes its members into loose Inbox rows here; only the one
// grouped receipt card is shown, per spec §2's "must not visually explode
// members" requirement.

import { useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { LoopAsset } from "../../data/loopTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { RadioBank } from "../../data/radioBankTypes";
import type { RadioDashboardReceipt } from "../../data/radioDashboardReceiptTypes";
import type { UseRadioLoopAuditionResult } from "../../logic/radio/radioLoopAudition";
import { buildRadioDashboardSummary } from "../../logic/radio/radioDashboardSummary";
import { radioPlaylistStateLabel } from "../../logic/radio/radioPlaylistPublicationState";
import { RadioLoopsWorkspace } from "./RadioLoopsWorkspace";

function readinessBadgeClass(readiness: string): string {
  switch (readiness) {
    case "READY": return "radio-badge radio-badge-ready";
    case "FAILED": return "radio-badge radio-badge-failed";
    case "NOT_YET_PACKAGEABLE": return "radio-badge radio-badge-unsupported";
    case "ANALYZING": return "radio-badge radio-badge-analyzing";
    default: return "radio-badge radio-badge-unprepared";
  }
}

function itemLabel(item: RadioInboxItem, libraryTracks: Track[], loops: LoopAsset[]): string {
  if (item.kind === "loop" && item.sourceLoopId) {
    const loop = loops.find((l) => l.id === item.sourceLoopId);
    if (loop) return loop.title;
  }
  if (item.sourceTrackId) {
    const track = libraryTracks.find((t) => t.trackId === item.sourceTrackId);
    if (track) return `${track.artist} — ${track.title}`;
  }
  if (item.sourceSoundId) {
    const track = libraryTracks.find((t) => t.trackId === item.sourceSoundId);
    if (track) return `${track.artist} — ${track.title}`;
  }
  return item.id;
}

interface Props {
  radioInboxItems: RadioInboxItem[];
  radioPlaylists: RadioPlaylist[];
  radioBanks: RadioBank[];
  radioDashboardReceipts: RadioDashboardReceipt[];
  libraryTracks: Track[];
  loops: LoopAsset[];
  publishedLoopPackageCount: number;
  onOpenPlaylists: () => void;
  onOpenBanks: () => void;
  onDismissReceipt: (receiptId: string) => void;
  onOpenSourceLoop: (trackId: string) => void;
  audition: UseRadioLoopAuditionResult;
  focusRadioLoopId?: string;
}

export function RadioDashboardView({
  radioInboxItems, radioPlaylists, radioBanks, radioDashboardReceipts, libraryTracks, loops,
  publishedLoopPackageCount, onOpenPlaylists, onOpenBanks, onDismissReceipt, onOpenSourceLoop, audition, focusRadioLoopId,
}: Props) {
  // "Open RadioLoops" deep-link target: a promotion completed elsewhere
  // asks to jump straight to the escape-hatch panel. App.tsx remounts this
  // view via `key={focusRadioLoopId}` on every such navigation, so a lazy
  // initial value here — not an effect — is what opens the panel.
  const [showPublished, setShowPublished] = useState(() => !!focusRadioLoopId);

  const summary = buildRadioDashboardSummary(radioDashboardReceipts, radioInboxItems, radioPlaylists, radioBanks);
  const isEmpty = summary.looseAssets.length === 0 && summary.playlistReceipts.length === 0 && summary.bankReceipts.length === 0;

  return (
    <div className="radio-dashboard-view">
      <div className="radio-dashboard-toolbar">
        <h2>RADIO Dashboard</h2>
        <button className="radio-link-button" onClick={() => setShowPublished(true)}>View Published Loop Packages →</button>
      </div>

      <div className="radio-dashboard-stats">
        <div className="radio-stat-tile">
          <span className="radio-stat-value">{summary.looseAssets.length}</span>
          <span className="radio-stat-label">Received Assets</span>
        </div>
        <button className="radio-stat-tile radio-stat-tile--clickable" onClick={onOpenPlaylists}>
          <span className="radio-stat-value">{radioPlaylists.length}</span>
          <span className="radio-stat-label">RADIO Playlists</span>
        </button>
        <button className="radio-stat-tile radio-stat-tile--clickable" onClick={onOpenBanks}>
          <span className="radio-stat-value">{radioBanks.length}</span>
          <span className="radio-stat-label">RADIO Banks</span>
        </button>
        <div className="radio-stat-tile">
          <span className="radio-stat-value">{publishedLoopPackageCount}</span>
          <span className="radio-stat-label">Published Loop Packages</span>
        </div>
      </div>

      {summary.alertCount > 0 && (
        <div className="radio-alert-banner" role="alert">
          {summary.alertCount} received asset{summary.alertCount !== 1 ? "s" : ""} failed readiness and need attention.
        </div>
      )}

      {isEmpty && (
        <div className="radio-dashboard-empty">Nothing has been sent to RADIO yet.</div>
      )}

      {(summary.playlistReceipts.length > 0 || summary.bankReceipts.length > 0) && (
        <div className="radio-dashboard-section">
          <h3>Received Playlists &amp; Banks</h3>
          <div className="radio-receipt-cards">
            {summary.playlistReceipts.map(({ receipt, playlist }) => (
              <div className="radio-receipt-card" key={receipt.id}>
                <div className="radio-receipt-card-art" style={{ background: playlist.accentColor ?? "var(--surface3)" }}>
                  {playlist.coverImage?.src ? <img src={playlist.coverImage.src} alt={playlist.title} /> : <span>♫</span>}
                </div>
                <div className="radio-receipt-card-body">
                  <span className="radio-receipt-card-title">{playlist.title}</span>
                  <span className="radio-receipt-card-meta">Playlist · {playlist.entries.length} entries · {radioPlaylistStateLabel(playlist.state)}</span>
                </div>
                <div className="radio-receipt-card-actions">
                  <button className="tb-btn sm" onClick={onOpenPlaylists}>Open</button>
                  <button className="tb-btn sm" onClick={() => onDismissReceipt(receipt.id)}>Dismiss</button>
                </div>
              </div>
            ))}
            {summary.bankReceipts.map(({ receipt, bank }) => (
              <div className="radio-receipt-card" key={receipt.id}>
                <div className="radio-receipt-card-art">
                  <span>▦</span>
                </div>
                <div className="radio-receipt-card-body">
                  <span className="radio-receipt-card-title">{bank.title}</span>
                  <span className="radio-receipt-card-meta">Bank · {bank.entries.length} entries</span>
                </div>
                <div className="radio-receipt-card-actions">
                  <button className="tb-btn sm" onClick={onOpenBanks}>Open</button>
                  <button className="tb-btn sm" onClick={() => onDismissReceipt(receipt.id)}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.looseAssets.length > 0 && (
        <div className="radio-dashboard-section">
          <h3>Received Assets</h3>
          <table className="radio-inbox-table">
            <thead>
              <tr><th>Kind</th><th>Source</th><th>State</th><th>Readiness</th><th></th></tr>
            </thead>
            <tbody>
              {summary.looseAssets.map(({ receipt, item }) => (
                <tr key={receipt.id}>
                  <td>{item.kind}</td>
                  <td>{itemLabel(item, libraryTracks, loops)}</td>
                  <td>{item.state}</td>
                  <td><span className={readinessBadgeClass(item.readiness)}>{item.readiness}</span></td>
                  <td><button className="tb-btn sm" onClick={() => onDismissReceipt(receipt.id)}>Dismiss</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPublished && (
        <div className="radio-overlay-panel">
          <div className="radio-overlay-header">
            <button className="radio-overlay-close" onClick={() => setShowPublished(false)}>← Back to Dashboard</button>
          </div>
          <div className="radio-overlay-body">
            <RadioLoopsWorkspace
              libraryTracks={libraryTracks}
              loops={loops}
              onOpenSourceLoop={onOpenSourceLoop}
              audition={audition}
              focusRadioLoopId={focusRadioLoopId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
