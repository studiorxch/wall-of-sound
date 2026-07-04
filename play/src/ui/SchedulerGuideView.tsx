// Scheduler / event guide (0621G, 0623C event-first language shift).
// Events are the promoted programming object; playlists are reusable music engines.
// Clicking an event row opens the attached playlist in the editor.

import { useState } from "react";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type {
  ScheduleState,
  ScheduleBlock,
  ScheduleBlockRole,
  ScheduleDisplayMode,
} from "../data/scheduleTypes";
import {
  SCHEDULE_BLOCK_ROLES,
  SCHEDULE_DISPLAY_MODES,
  ROLE_LABELS,
  DISPLAY_MODE_LABELS,
} from "../data/scheduleTypes";
import type { BroadcastEvent } from "../data/eventTypes";
import { resolveSchedule, sortScheduleBlocks, findOverlappingBlockIds } from "../logic/scheduleResolver";

function fmtClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}
function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

type Props = {
  schedule: ScheduleState;
  playlists: PlaylistRecord[];
  nowIso: string;
  broadcastEvents?: BroadcastEvent[];
  onAddBlock: (params: {
    playlistId: string;
    startTimeIso: string;
    role: ScheduleBlockRole;
    displayMode: ScheduleDisplayMode;
  }) => void;
  onRemoveBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, deltaMinutes: number) => void;
  onAddEvent?: (event: BroadcastEvent) => void;
  onSelectPlaylist?: (playlistId: string) => void;
};

export function SchedulerGuideView({
  schedule, playlists, nowIso, broadcastEvents = [],
  onAddBlock, onRemoveBlock, onMoveBlock, onAddEvent, onSelectPlaylist,
}: Props) {
  const firstPlId = playlists[0]?.playlistId ?? "";
  const [playlistId, setPlaylistId] = useState(firstPlId);
  const [startLocal, setStartLocal] = useState(() => isoToLocalInput(nowIso));
  const [role, setRole] = useState<ScheduleBlockRole>("main_block");
  const [displayMode, setDisplayMode] = useState<ScheduleDisplayMode>("full_scene");

  const resolved = resolveSchedule({ schedule, nowIso });
  const sorted = sortScheduleBlocks(schedule.blocks);
  const overlapIds = findOverlappingBlockIds(schedule.blocks);

  const selectedPl = playlists.find((p) => p.playlistId === playlistId) ?? playlists[0];

  function handleAdd() {
    if (!selectedPl) return;
    const startTimeIso = localInputToIso(startLocal);
    onAddBlock({ playlistId: selectedPl.playlistId, startTimeIso, role, displayMode });
    if (onAddEvent) {
      const endIso = new Date(Date.parse(startTimeIso) + 120 * 60_000).toISOString();
      const now = new Date().toISOString();
      const isTemplate = selectedPl.playlistRole === "template";
      const event: BroadcastEvent = {
        id: `evt_${Date.now().toString(36)}`,
        title: selectedPl.title,
        startIso: startTimeIso,
        endIso,
        ...(isTemplate
          ? { playlistTemplateId: selectedPl.playlistId, sourcePoolId: selectedPl.sourcePoolId }
          : { playlistId: selectedPl.playlistId }),
        presentationMode: selectedPl.broadcastIdentity?.presentationMode,
        status: "scheduled",
        createdAt: now,
        updatedAt: now,
      };
      onAddEvent(event);
    }
  }

  return (
    <div className="sched-view">
      <div className="sched-header">
        <div>
          <div className="sched-title">{schedule.title}</div>
          <div className="sched-now-ref">{fmtDay(nowIso)} · {fmtClock(nowIso)}</div>
        </div>
        {broadcastEvents.length > 0 && (
          <div className="sched-event-count">{broadcastEvents.length} event{broadcastEvents.length !== 1 ? "s" : ""}</div>
        )}
      </div>

      {/* Now / Next summary — event language */}
      <div className="sched-nownext">
        <div className="sched-card sched-card-now">
          <div className="sched-card-label">NOW EVENT</div>
          {resolved.now ? (
            <>
              <div className="sched-card-title">{resolved.now.title}</div>
              <div className="sched-card-meta">
                {fmtClock(resolved.now.startTimeIso)}–{fmtClock(resolved.now.endTimeIso)} · {ROLE_LABELS[resolved.now.role]}
              </div>
            </>
          ) : (
            <div className="sched-card-empty">Nothing scheduled</div>
          )}
        </div>
        <div className="sched-card sched-card-next">
          <div className="sched-card-label">NEXT EVENT</div>
          {resolved.next ? (
            <>
              <div className="sched-card-title">{resolved.next.title}</div>
              <div className="sched-card-meta">
                {fmtClock(resolved.next.startTimeIso)} · {fmtDur(resolved.next.durationMinutes)}
              </div>
            </>
          ) : (
            <div className="sched-card-empty">—</div>
          )}
        </div>
      </div>

      {/* Add Event controls */}
      <div className="sched-controls">
        <select className="sched-input" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} title="Playlist">
          {playlists.map((p) => (
            <option key={p.playlistId} value={p.playlistId}>{p.title}</option>
          ))}
        </select>
        <input
          className="sched-input" type="datetime-local" value={startLocal}
          onChange={(e) => setStartLocal(e.target.value)} title="Start time"
        />
        <select className="sched-input" value={role} onChange={(e) => setRole(e.target.value as ScheduleBlockRole)} title="Role">
          {SCHEDULE_BLOCK_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select className="sched-input" value={displayMode} onChange={(e) => setDisplayMode(e.target.value as ScheduleDisplayMode)} title="Display mode">
          {SCHEDULE_DISPLAY_MODES.map((d) => <option key={d} value={d}>{DISPLAY_MODE_LABELS[d]}</option>)}
        </select>
        <button className="sched-add-btn" onClick={handleAdd} disabled={!selectedPl}>+ Add Event</button>
      </div>

      {/* Guide table */}
      {sorted.length === 0 ? (
        <div className="sched-empty-state">No events scheduled yet. Add a playlist above to build the event guide.</div>
      ) : (
        <table className="sched-table">
          <thead>
            <tr>
              <th>Time</th><th>Dur</th><th>Event / Program</th><th>Role</th><th>Display Mode</th><th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b: ScheduleBlock) => {
              const conflict = overlapIds.has(b.blockId);
              const isNow = resolved.now?.blockId === b.blockId;
              const isNext = resolved.next?.blockId === b.blockId;
              return (
                <tr key={b.blockId} className={`${conflict ? "sched-row-conflict" : ""}${isNow ? " sched-row-now" : ""}`}>
                  <td className="sched-cell-time">
                    {isNow && <span className="sched-pill sched-pill-now">NOW</span>}
                    {isNext && <span className="sched-pill sched-pill-next">NEXT</span>}
                    {fmtClock(b.startTimeIso)}–{fmtClock(b.endTimeIso)}
                  </td>
                  <td>{fmtDur(b.durationMinutes)}</td>
                  <td className="sched-cell-title">
                    {b.playlistId && onSelectPlaylist ? (
                      <button
                        className="sched-pl-link"
                        onClick={() => onSelectPlaylist(b.playlistId!)}
                        title="Open playlist in editor"
                      >{b.title}</button>
                    ) : b.title}
                    {conflict && <span className="sched-conflict-tag" title="Overlaps another block">Schedule overlap</span>}
                  </td>
                  <td>{ROLE_LABELS[b.role] ?? b.role}</td>
                  <td>{DISPLAY_MODE_LABELS[b.displayMode] ?? b.displayMode}</td>
                  <td className="sched-cell-actions">
                    <button className="sched-icon-btn" title="Move 30m earlier" onClick={() => onMoveBlock(b.blockId, -30)}>−</button>
                    <button className="sched-icon-btn" title="Move 30m later" onClick={() => onMoveBlock(b.blockId, 30)}>+</button>
                    <button className="sched-icon-btn sched-remove" title="Remove event" onClick={() => onRemoveBlock(b.blockId)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
