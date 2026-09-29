// RADIO-04 -- the Program Inspector (V1, intentionally small):
// published Playlist/Package source, Channel, date, start/end, recurrence.
// Extension space for later Program capabilities (presentation/visual,
// Waveformer behavior, artwork, procedural/timed callouts, behavioral
// events, live inputs, Event relationship) is left in the architecture
// (a real Program document exists, real Schedule blocks exist) but NONE
// of those capabilities are implemented here.
//
// CREATE: choose a published Playlist, date, start/end, optional bounded
// recurrence -> Schedule. Program creation/reuse happens entirely via
// radioProgramLifecycle.ts's resolveProgramForSchedule -- this dialog
// never calls createRadioProgram/updateRadioProgram directly.
//
// EDIT (an existing block): read-only detail + Cancel this occurrence.
// V1 deliberately does not support editing an existing occurrence's own
// start/end/playlist in place -- correcting a mistake means cancelling it
// (never deleted, see radioScheduleTypes.ts) and scheduling a fresh one,
// consistent with this whole system's immutable-occurrence discipline.

import { useMemo, useState } from "react";
import {
  createFirebaseMemberIdentityAuthority,
  findRadioScheduleConflicts,
  generateRadioScheduleSeriesId,
  type EventRadioRepository,
  type RadioProgramSummary,
  type RadioScheduleBlock,
  type RadioScheduleRecurrenceFrequency,
  type RadioScheduleRepository,
} from "@studiorich/member-identity";
import { findProgramsForStation, resolveProgramForSchedule, type SchedulablePlaylist } from "../../logic/radio/radioProgramLifecycle";
import { materializeOccurrences } from "../../logic/radio/radioScheduleRecurrence";

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toTimeInputValue(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function combineDateTime(dateStr: string, timeStr: string): number {
  const [y, mo, da] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  return new Date(y, mo - 1, da, h, mi, 0, 0).getTime();
}

interface Props {
  channelId: string;
  block: RadioScheduleBlock | null;
  initialStartAtMs: number;
  initialEndAtMs: number;
  existingBlocks: readonly RadioScheduleBlock[];
  existingPrograms: readonly RadioProgramSummary[];
  schedulablePlaylists: readonly SchedulablePlaylist[];
  getScheduleRepository: () => RadioScheduleRepository;
  getEventRadioRepository: () => EventRadioRepository;
  onClose: () => void;
  onSaved: () => void;
}

let cachedMemberIdentity: ReturnType<typeof createFirebaseMemberIdentityAuthority> | null = null;
function getMemberIdentity() {
  cachedMemberIdentity ??= createFirebaseMemberIdentityAuthority(import.meta.env);
  return cachedMemberIdentity;
}

type SaveState = { status: "idle" } | { status: "pending" } | { status: "error"; message: string };

export function RadioScheduleBlockDialog({
  channelId, block, initialStartAtMs, initialEndAtMs, existingBlocks, existingPrograms, schedulablePlaylists,
  getScheduleRepository, getEventRadioRepository, onClose, onSaved,
}: Props) {
  const isEdit = block !== null;
  const programForBlock = block ? existingPrograms.find((p) => p.id === block.programId) : undefined;

  const [radioPlaylistId, setRadioPlaylistId] = useState<string>(schedulablePlaylists[0]?.radioPlaylistId ?? "");
  const [dateStr, setDateStr] = useState(toDateInputValue(initialStartAtMs));
  const [startTimeStr, setStartTimeStr] = useState(toTimeInputValue(initialStartAtMs));
  const [endTimeStr, setEndTimeStr] = useState(toTimeInputValue(initialEndAtMs));
  const [frequency, setFrequency] = useState<RadioScheduleRecurrenceFrequency>("none");
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<"count" | "until">("count");
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [recurrenceUntilStr, setRecurrenceUntilStr] = useState(toDateInputValue(initialStartAtMs + 30 * 24 * 3600 * 1000));
  const [ambiguousChoice, setAmbiguousChoice] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const startAtMs = combineDateTime(dateStr, startTimeStr);
  const endAtMs = combineDateTime(dateStr, endTimeStr);

  const selectedPlaylist = schedulablePlaylists.find((p) => p.radioPlaylistId === radioPlaylistId) ?? null;
  const programsForSelectedStation = selectedPlaylist ? findProgramsForStation(existingPrograms, selectedPlaylist.radioPlaylistId) : [];
  const isAmbiguous = programsForSelectedStation.length > 1;

  const recurrence = useMemo(
    () => frequency === "none" ? null : {
      frequency,
      ...(recurrenceEndMode === "count" ? { count: recurrenceCount } : { untilMs: combineDateTime(recurrenceUntilStr, endTimeStr) }),
    },
    [frequency, recurrenceEndMode, recurrenceCount, recurrenceUntilStr, endTimeStr],
  );

  const previewOccurrences = useMemo(() => {
    if (!Number.isFinite(startAtMs) || !Number.isFinite(endAtMs) || endAtMs <= startAtMs) return [];
    return materializeOccurrences({ startAtMs, endAtMs }, recurrence);
  }, [startAtMs, endAtMs, recurrence]);

  const conflicts = useMemo(
    () => findRadioScheduleConflicts(existingBlocks.filter((b) => b.id !== block?.id), previewOccurrences),
    [existingBlocks, previewOccurrences, block],
  );

  async function handleSave() {
    if (!selectedPlaylist) return;
    if (endAtMs <= startAtMs) { setSaveState({ status: "error", message: "End time must be after start time." }); return; }
    if (conflicts.length > 0) { setSaveState({ status: "error", message: `This overlaps ${conflicts.length} existing/candidate block(s) on this Channel.` }); return; }
    if (isAmbiguous && !ambiguousChoice) { setSaveState({ status: "error", message: "Multiple Programs already reference this Playlist — choose which one to use." }); return; }

    setSaveState({ status: "pending" });
    try {
      const memberState = getMemberIdentity().getState();
      const updatedByMemberId = memberState.status === "signedIn" ? memberState.authUser.uid : "unknown";
      const eventRadioRepository = getEventRadioRepository();
      const program = await resolveProgramForSchedule(
        eventRadioRepository,
        selectedPlaylist,
        programsForSelectedStation,
        isAmbiguous ? ambiguousChoice : undefined,
      );
      const seriesId = recurrence ? generateRadioScheduleSeriesId() : null;
      await getScheduleRepository().createScheduleBlocks(
        previewOccurrences.map((o) => ({ channelId, programId: program.id, startAtMs: o.startAtMs, endAtMs: o.endAtMs })),
        seriesId,
        recurrence,
        updatedByMemberId,
      );
      onSaved();
    } catch (error) {
      setSaveState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleCancelOccurrence() {
    if (!block) return;
    setSaveState({ status: "pending" });
    try {
      const memberState = getMemberIdentity().getState();
      const updatedByMemberId = memberState.status === "signedIn" ? memberState.authUser.uid : "unknown";
      await getScheduleRepository().cancelScheduleBlock(block.id, updatedByMemberId);
      onSaved();
    } catch (error) {
      setSaveState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="radio-dialog-overlay" role="dialog" aria-modal="true">
      <div className="radio-dialog radio-schedule-block-dialog">
        <div className="radio-dialog-header-row">
          <h3>{isEdit ? "Scheduled Program" : "Schedule a Program"}</h3>
          <button className="radio-overlay-close" onClick={onClose}>✕</button>
        </div>

        {isEdit ? (
          <div className="radio-schedule-block-detail">
            <p><strong>{programForBlock?.title ?? block!.programId}</strong></p>
            <p className="radio-diff-note">Channel: {block!.channelId}</p>
            <p className="radio-diff-note">{fmtRange(block!.startAtMs, block!.endAtMs)}</p>
            {block!.recurrence && <p className="radio-diff-note">Recurrence: {block!.recurrence.frequency}{block!.seriesId ? ` (part of a series)` : ""}</p>}
            {block!.status === "cancelled" ? (
              <p className="radio-diff-note">This occurrence is cancelled.</p>
            ) : (
              <button className="npw-btn npw-btn--ghost" onClick={handleCancelOccurrence} disabled={saveState.status === "pending"}>
                {saveState.status === "pending" ? "Cancelling…" : "Cancel this occurrence"}
              </button>
            )}
            {saveState.status === "error" && <p className="radio-diff-note">{saveState.message}</p>}
          </div>
        ) : (
          <div className="radio-schedule-block-form">
            <label>
              Playlist
              <select value={radioPlaylistId} onChange={(e) => setRadioPlaylistId(e.target.value)}>
                {schedulablePlaylists.length === 0 && <option value="">No published Playlists available</option>}
                {schedulablePlaylists.map((p) => <option key={p.radioPlaylistId} value={p.radioPlaylistId}>{p.title}</option>)}
              </select>
            </label>

            {isAmbiguous && (
              <label>
                Multiple Programs already reference this Playlist — choose one
                <select value={ambiguousChoice} onChange={(e) => setAmbiguousChoice(e.target.value)}>
                  <option value="">Select…</option>
                  {programsForSelectedStation.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.id}) — v{p.bundleVersion}</option>)}
                </select>
              </label>
            )}

            <label>Date <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} /></label>
            <label>Start <input type="time" value={startTimeStr} onChange={(e) => setStartTimeStr(e.target.value)} /></label>
            <label>End <input type="time" value={endTimeStr} onChange={(e) => setEndTimeStr(e.target.value)} /></label>

            <label>
              Recurrence
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as RadioScheduleRecurrenceFrequency)}>
                <option value="none">None (one time)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            {frequency !== "none" && (
              <div className="radio-schedule-recurrence-bound">
                <label>
                  <input type="radio" checked={recurrenceEndMode === "count"} onChange={() => setRecurrenceEndMode("count")} />
                  {" "}Occurrences: <input type="number" min={1} max={366} value={recurrenceCount} onChange={(e) => setRecurrenceCount(Number(e.target.value))} disabled={recurrenceEndMode !== "count"} />
                </label>
                <label>
                  <input type="radio" checked={recurrenceEndMode === "until"} onChange={() => setRecurrenceEndMode("until")} />
                  {" "}Until: <input type="date" value={recurrenceUntilStr} onChange={(e) => setRecurrenceUntilStr(e.target.value)} disabled={recurrenceEndMode !== "until"} />
                </label>
                <p className="radio-diff-note">{previewOccurrences.length} occurrence(s) will be scheduled.</p>
              </div>
            )}

            {conflicts.length > 0 && (
              <p className="radio-diff-note">⚠ Overlaps {conflicts.length} existing or candidate block(s) on this Channel — resolve before saving.</p>
            )}
            {saveState.status === "error" && <p className="radio-diff-note">{saveState.message}</p>}

            <div className="radio-dialog-actions">
              <button className="npw-btn npw-btn--ghost" onClick={onClose}>Cancel</button>
              <button
                className="npw-btn npw-btn--primary"
                onClick={handleSave}
                disabled={!selectedPlaylist || saveState.status === "pending" || conflicts.length > 0 || previewOccurrences.length === 0}
              >
                {saveState.status === "pending" ? "Scheduling…" : "Schedule"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtRange(startAtMs: number, endAtMs: number): string {
  const start = new Date(startAtMs);
  const end = new Date(endAtMs);
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
