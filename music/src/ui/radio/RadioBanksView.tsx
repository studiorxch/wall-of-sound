// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §4/§11 — RADIO
// Banks: a received-only card grid (title + entry count only — MUSIC's own
// Sampler Bank grid has no artwork/duration concept for banks either), plus
// a lightweight entry-list detail view. No waveform batch-prep, no
// embedded Looper mount — banks are a reusable performance kit, not an
// ordered radio program. No MUSIC-side prop: sending happens exclusively
// from MUSIC's own bank cards/detail.

import { useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioBank } from "../../data/radioBankTypes";

interface Props {
  radioBanks: RadioBank[];
  radioInboxItems: RadioInboxItem[];
  libraryTracks: Track[];
  onUpdateRadioBank: (id: string, patch: Partial<RadioBank>) => void;
}

function itemLabel(item: RadioInboxItem | undefined, libraryTracks: Track[]): string {
  if (!item) return "—";
  if (item.sourceSoundId) {
    const track = libraryTracks.find((t) => t.trackId === item.sourceSoundId);
    if (track) return `${track.artist} — ${track.title}`;
  }
  return item.id;
}

export function RadioBanksView({ radioBanks, radioInboxItems, libraryTracks, onUpdateRadioBank }: Props) {
  const [openBankId, setOpenBankId] = useState<string | null>(null);

  const openBank = openBankId ? radioBanks.find((b) => b.id === openBankId) ?? null : null;

  if (openBank) {
    const entries = openBank.entries.slice().sort((a, b) => a.order - b.order);
    return (
      <div className="radio-bank-detail">
        <div className="radio-prep-header">
          <button className="looper-back" onClick={() => setOpenBankId(null)}>← Back to Banks</button>
          <h2>{openBank.title}</h2>
          <span className="radio-prep-header-meta">{entries.length} entries</span>
        </div>
        <table className="radio-inbox-table">
          <thead><tr><th>#</th><th>Source</th><th>Locked</th></tr></thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={3} className="radio-inbox-empty">This bank has no entries.</td></tr>
            )}
            {entries.map((entry, i) => {
              const item = radioInboxItems.find((it) => it.id === entry.inboxItemId);
              return (
                <tr key={entry.id}>
                  <td>{i + 1}</td>
                  <td>{itemLabel(item, libraryTracks)}</td>
                  <td>
                    <button
                      className="tb-btn sm"
                      onClick={() => onUpdateRadioBank(openBank.id, {
                        entries: openBank.entries.map((e) => (e.id === entry.id ? { ...e, locked: !e.locked } : e)),
                      })}
                    >
                      {entry.locked ? "Locked" : "Unlocked"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="radio-banks-view">
      <h2>RADIO Banks</h2>

      {radioBanks.length === 0 ? (
        <div className="radio-dashboard-empty">Nothing has been sent to RADIO yet.</div>
      ) : (
        <div className="pg-grid radio-bank-grid">
          {radioBanks.map((b) => (
            <div className="pgc pgc--sampler radio-bank-card" key={b.id} onClick={() => setOpenBankId(b.id)}>
              <div className="pgc-art pgc-art--sampler"><span className="pgc-sampler-icon">▦</span></div>
              <span className="pgc-count-badge">{b.entries.length}</span>
              <div className="pgc-info">
                <span className="pgc-title">{b.title}</span>
                <span className="pgc-updated">{new Date(b.updatedAt).toLocaleString()}</span>
              </div>
              <div className="pgc-hover-actions" onClick={(e) => e.stopPropagation()}>
                <button className="pgc-ha-btn" title="Open" onClick={() => setOpenBankId(b.id)}>Open</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
