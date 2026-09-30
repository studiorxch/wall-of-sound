// RADIO-04 (batch 0929-6) -- the operator-facing weekly programming grid.
// "RADIO -> Programming -> choose/view Channel -> navigate dated weekly
// schedule -> click open time / + Program -> choose published Playlist ->
// choose start/end -> optionally establish recurrence -> Schedule."
//
// Inspired by linear/FAST broadcast scheduling, not a general-purpose
// calendar: the week is a VIEWPORT onto real dated weeks (Prev/This/Next),
// never the data boundary -- past weeks remain inspectable, future weeks
// programmable, and every block here is a real, independently-persisted
// RadioScheduleBlock (radioScheduleTypes.ts), never a client-local mock.
//
// Program creation/reuse happens ENTIRELY behind this workflow now
// (RadioPlaylistPublishPanel.tsx no longer offers Create/Update Program --
// see that file's own updated header comment) via
// radioProgramLifecycle.ts's resolveProgramForSchedule, the one place
// createRadioProgram/updateRadioProgram are ever called for scheduling.

import { useEffect, useMemo, useState } from "react";
import {
  createFirebaseEventRadioRepository,
  createFirebaseMemberIdentityAuthority,
  createFirebaseRadioChannelRepository,
  createFirebaseRadioScheduleRepository,
  STUDIO_RICH_OPERATOR_EMAILS,
  type MemberIdentityState,
  type RadioChannel,
  type RadioProgramSummary,
  type RadioScheduleBlock,
} from "@studiorich/member-identity";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { RadioWebExportRecord, RadioSitesPublicationRecord } from "../../data/radioWebBundleTypes";
import { listSchedulablePlaylists, type SchedulablePlaylist } from "../../logic/radio/radioProgramLifecycle";
import { findActiveScheduleBlock } from "../../logic/radio/radioScheduleBroadcastPriority";
import { resolveRadioProgramGuide, type RadioProgramGuide } from "../../logic/radio/radioPublicProgramGuide";
import { buildActivateChannelUpdate, buildDeactivateChannelUpdate } from "../../logic/radio/channelRotationEditorState";
import { canActivateChannel, canDeleteChannel } from "../../logic/radio/radioChannelLifecycle";
import { RadioScheduleBlockDialog } from "./RadioScheduleBlockDialog";
import { RadioNewChannelDialog } from "./RadioNewChannelDialog";
import { RadioRenameChannelDialog } from "./RadioRenameChannelDialog";

// Same lazy-singleton convention RadioPlaylistPublishPanel.tsx already
// uses -- constructed on first real use, never at module scope (this
// component is reached from a static import chain from App.tsx).
let cachedMemberIdentity: ReturnType<typeof createFirebaseMemberIdentityAuthority> | null = null;
function getMemberIdentity() {
  cachedMemberIdentity ??= createFirebaseMemberIdentityAuthority(import.meta.env);
  return cachedMemberIdentity;
}
let cachedChannelRepository: ReturnType<typeof createFirebaseRadioChannelRepository> | null = null;
function getChannelRepository() {
  cachedChannelRepository ??= createFirebaseRadioChannelRepository(import.meta.env);
  return cachedChannelRepository;
}
let cachedScheduleRepository: ReturnType<typeof createFirebaseRadioScheduleRepository> | null = null;
function getScheduleRepository() {
  cachedScheduleRepository ??= createFirebaseRadioScheduleRepository(import.meta.env);
  return cachedScheduleRepository;
}
let cachedEventRadioRepository: ReturnType<typeof createFirebaseEventRadioRepository> | null = null;
function getEventRadioRepository() {
  cachedEventRadioRepository ??= createFirebaseEventRadioRepository(import.meta.env);
  return cachedEventRadioRepository;
}

const OPERATOR_EMAILS = STUDIO_RICH_OPERATOR_EMAILS;
const SELECTED_CHANNEL_STORAGE_KEY = "wos:radioProgramming:selectedChannelId";
const DAY_MS = 24 * 3600 * 1000;
const HOUR_PX = 28;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeekMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun..6=Sat -- normalize to a Monday-start week.
  const isoDay = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - isoDay);
  return d.getTime();
}

function fmtDayHeader(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// RADIO-04C -- presentation only: the hour axis's own gutter labels (every
// even hour, "12 AM"/"2 AM"/.../"12 PM"/.../"10 PM"), never the underlying
// timestamp/storage/timezone semantics -- every actual scheduling
// computation in this file still works in real epoch ms via
// startOfWeekMs/DAY_MS/combineDateTime, completely unaffected by how an
// hour number is merely displayed here.
function fmtHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour} ${period}`;
}

function fmtWeekRange(weekStartMs: number): string {
  const end = weekStartMs + 6 * DAY_MS;
  return `${fmtDayHeader(weekStartMs)} – ${fmtDayHeader(end)}, ${new Date(weekStartMs).getFullYear()}`;
}

interface Props {
  radioPlaylists: readonly RadioPlaylist[];
  radioWebExports: readonly RadioWebExportRecord[];
  radioSitesPublications: readonly RadioSitesPublicationRecord[];
}

export function RadioProgrammingView({ radioPlaylists, radioWebExports, radioSitesPublications }: Props) {
  const [memberState, setMemberState] = useState<MemberIdentityState>(() => getMemberIdentity().getState());
  useEffect(() => {
    const identity = getMemberIdentity();
    const unsubscribe = identity.subscribe(setMemberState);
    void identity.start();
    return unsubscribe;
  }, []);
  const isAuthorizedOperator = memberState.status === "signedIn" && OPERATOR_EMAILS.includes(memberState.authUser.email ?? "");

  // RADIO-04A -- Programming must be able to recover operator authority
  // itself, in-tab, rather than sending the operator to Event Radio
  // Control and hoping cross-tab auth-state sync catches up before they
  // click back. This calls the SAME shared MemberIdentityAuthority
  // instance every other RADIO surface uses (createFirebaseMemberIdentityAuthority
  // returns the one registered authority per Firebase app, see
  // createFirebaseMemberIdentityAuthority.ts) -- not a second identity
  // system, not a new approval/staging step, just the existing
  // signInWithGoogle() capability triggered from where it's needed.
  const [signInError, setSignInError] = useState<string | null>(null);
  function handleSignIn() {
    setSignInError(null);
    getMemberIdentity().signInWithGoogle().catch((error) => {
      setSignInError(error instanceof Error ? error.message : String(error));
    });
  }
  function handleSignOut() {
    void getMemberIdentity().signOut();
  }

  const [channels, setChannels] = useState<readonly RadioChannel[] | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(() => {
    try { return window.localStorage.getItem(SELECTED_CHANNEL_STORAGE_KEY); } catch { return null; }
  });
  const [weekAnchorMs, setWeekAnchorMs] = useState<number>(() => startOfWeekMs(Date.now()));
  const [blocks, setBlocks] = useState<readonly RadioScheduleBlock[] | null>(null);
  const [programs, setPrograms] = useState<readonly RadioProgramSummary[] | null>(null);
  const [guide, setGuide] = useState<RadioProgramGuide | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [dialogTarget, setDialogTarget] = useState<{ block: RadioScheduleBlock | null; startAtMs: number; endAtMs: number } | null>(null);
  const [showNewChannelDialog, setShowNewChannelDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showChannelMenu, setShowChannelMenu] = useState(false);
  const [channelActionState, setChannelActionState] = useState<{ status: "idle" } | { status: "pending" } | { status: "error"; message: string }>({ status: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Adjust state during render (React-endorsed pattern, same one used in
  // RadioMultiTrackPrepWorkspace.tsx's title sync) rather than an effect
  // that calls setState synchronously -- clears stale-channel blocks
  // immediately when the selection changes, before the new fetch below
  // resolves, so the grid never briefly shows a different channel's data.
  const [blocksLoadedForChannelId, setBlocksLoadedForChannelId] = useState<string | null>(null);
  if (selectedChannelId !== blocksLoadedForChannelId) {
    setBlocksLoadedForChannelId(selectedChannelId);
    if (blocks !== null) setBlocks(null);
  }

  useEffect(() => {
    let cancelled = false;
    getChannelRepository().listRadioChannels()
      .then((list) => {
        if (cancelled) return;
        setChannels(list);
        setSelectedChannelId((prev) => {
          if (prev && list.some((c) => c.channelId === prev)) return prev;
          return list[0]?.channelId ?? null;
        });
      })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selectedChannelId) {
      try { window.localStorage.setItem(SELECTED_CHANNEL_STORAGE_KEY, selectedChannelId); } catch { /* best-effort only */ }
    }
  }, [selectedChannelId]);

  // Named so RadioScheduleBlockDialog's onSaved callback can trigger the
  // exact same reload after a write, without duplicating the fetch logic.
  async function reloadSchedule() {
    if (!selectedChannelId) return;
    const [blockList, programList] = await Promise.all([
      getScheduleRepository().listScheduleBlocksForChannel(selectedChannelId),
      getEventRadioRepository().listRadioPrograms(),
    ]);
    setBlocks(blockList);
    setPrograms(programList);
  }

  useEffect(() => {
    if (!selectedChannelId) return;
    let cancelled = false;
    // Inlined (not just `reloadSchedule().catch(...)`) so every setState
    // call here is visibly inside this effect's own async continuation --
    // matches the channels-fetch effect above's own pattern.
    (async () => {
      try {
        const [blockList, programList] = await Promise.all([
          getScheduleRepository().listScheduleBlocksForChannel(selectedChannelId),
          getEventRadioRepository().listRadioPrograms(),
        ]);
        if (cancelled) return;
        setBlocks(blockList);
        setPrograms(programList);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedChannelId]);

  // Now/Next/Upcoming, ticking every 30s -- enough to visibly demonstrate a
  // scheduled window taking priority when it begins, without hammering
  // Firestore every second.
  useEffect(() => {
    if (!selectedChannelId) return;
    let cancelled = false;
    function tick() {
      if (!selectedChannelId) return;
      resolveRadioProgramGuide({
        channelId: selectedChannelId,
        nowMs: Date.now(),
        radioChannelRepository: getChannelRepository(),
        eventRadioRepository: getEventRadioRepository(),
        radioScheduleRepository: getScheduleRepository(),
      }).then((result) => { if (!cancelled) { setGuide(result); setNowMs(Date.now()); } }).catch(() => { /* guide is best-effort display */ });
    }
    tick();
    const interval = window.setInterval(tick, 30_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [selectedChannelId, blocks]);

  const schedulablePlaylists: readonly SchedulablePlaylist[] = useMemo(
    () => listSchedulablePlaylists(radioPlaylists, radioWebExports, radioSitesPublications),
    [radioPlaylists, radioWebExports, radioSitesPublications],
  );

  const programTitleById = useMemo(() => new Map((programs ?? []).map((p) => [p.id, p.title])), [programs]);

  const selectedChannel = channels?.find((c) => c.channelId === selectedChannelId) ?? null;

  // RADIO-04E -- Activate/Deactivate reuse channelControlRuntime.ts's own
  // pure buildActivateChannelUpdate/buildDeactivateChannelUpdate builders
  // (channelRotationEditorState.ts) rather than constructing the update
  // payload a second time. canActivateChannel is a friendly pre-flight
  // check only -- the real gate is firestoreRadioChannelRepository.ts's
  // own status-aware validation, which rejects this exact case
  // authoritatively regardless of what this check does.
  async function handleActivate() {
    if (!selectedChannel) return;
    const check = canActivateChannel(selectedChannel);
    if (!check.ok) { setChannelActionState({ status: "error", message: check.reason }); return; }
    setChannelActionState({ status: "pending" });
    try {
      const memberState = getMemberIdentity().getState();
      const updatedByMemberId = memberState.status === "signedIn" ? memberState.authUser.uid : "unknown";
      const updated = await getChannelRepository().updateRadioChannel(buildActivateChannelUpdate(selectedChannel.channelId), updatedByMemberId);
      setChannels((prev) => (prev ?? []).map((c) => (c.channelId === updated.channelId ? updated : c)));
      setChannelActionState({ status: "idle" });
      setShowChannelMenu(false);
    } catch (error) {
      setChannelActionState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleDeactivate() {
    if (!selectedChannel) return;
    setChannelActionState({ status: "pending" });
    try {
      const memberState = getMemberIdentity().getState();
      const updatedByMemberId = memberState.status === "signedIn" ? memberState.authUser.uid : "unknown";
      const updated = await getChannelRepository().updateRadioChannel(buildDeactivateChannelUpdate(selectedChannel.channelId), updatedByMemberId);
      setChannels((prev) => (prev ?? []).map((c) => (c.channelId === updated.channelId ? updated : c)));
      setChannelActionState({ status: "idle" });
      setShowChannelMenu(false);
    } catch (error) {
      setChannelActionState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  // RADIO-04E -- hard-delete, gated on canDeleteChannel's own precondition
  // (inactive, and zero radioScheduleBlocks ever reference this channelId
  // -- see that module's own doc on why this is the smallest safe rule).
  // One confirmation, same window.confirm convention every other
  // destructive RADIO/MEMBER action already uses (blackbookRuntime.ts,
  // memberHomeUI.ts, channelControlRuntime.ts's own Start/Restart Rotation
  // confirm).
  async function handleDelete() {
    if (!selectedChannel) return;
    setChannelActionState({ status: "pending" });
    try {
      const scheduleBlocks = await getScheduleRepository().listScheduleBlocksForChannel(selectedChannel.channelId);
      const check = canDeleteChannel(selectedChannel, scheduleBlocks);
      if (!check.ok) { setChannelActionState({ status: "error", message: check.reason }); return; }
      if (!window.confirm(`Delete "${selectedChannel.title}"? This cannot be undone.`)) {
        setChannelActionState({ status: "idle" });
        return;
      }
      await getChannelRepository().deleteRadioChannel(selectedChannel.channelId);
      setChannels((prev) => {
        const next = (prev ?? []).filter((c) => c.channelId !== selectedChannel.channelId);
        setSelectedChannelId(next[0]?.channelId ?? null);
        return next;
      });
      setChannelActionState({ status: "idle" });
      setShowChannelMenu(false);
    } catch (error) {
      setChannelActionState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function openCreateDialog(dayStartMs: number, hour: number) {
    const startAtMs = dayStartMs + hour * 3600 * 1000;
    setDialogTarget({ block: null, startAtMs, endAtMs: startAtMs + 2 * 3600 * 1000 });
  }
  function openEditDialog(block: RadioScheduleBlock) {
    setDialogTarget({ block, startAtMs: block.startAtMs, endAtMs: block.endAtMs });
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => weekAnchorMs + i * DAY_MS);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="radio-programming-view">
      <div className="radio-programming-header">
        <h2>RADIO Programming</h2>
        <label className="radio-programming-channel-select">
          Channel:{" "}
          <select value={selectedChannelId ?? ""} onChange={(e) => setSelectedChannelId(e.target.value || null)} disabled={!channels || channels.length === 0}>
            {!channels && <option>Loading…</option>}
            {channels?.length === 0 && <option>No Channels found</option>}
            {channels?.map((c) => <option key={c.channelId} value={c.channelId}>{c.title} ({c.status})</option>)}
          </select>
          {isAuthorizedOperator && (
            <button
              type="button"
              className="npw-btn npw-btn--ghost radio-programming-new-channel-btn"
              title="New Channel"
              onClick={() => setShowNewChannelDialog(true)}
            >
              +
            </button>
          )}
          {isAuthorizedOperator && selectedChannel && (
            <span className="radio-programming-channel-menu">
              <button
                type="button"
                className="npw-btn npw-btn--ghost radio-programming-new-channel-btn"
                title="Channel actions"
                onClick={() => { setShowChannelMenu((v) => !v); setChannelActionState({ status: "idle" }); }}
              >
                •••
              </button>
              {showChannelMenu && (
                <div className="radio-programming-channel-menu-popover">
                  <button type="button" className="radio-programming-channel-menu-item" onClick={() => { setShowRenameDialog(true); setShowChannelMenu(false); }}>
                    Rename
                  </button>
                  {selectedChannel.status === "active" ? (
                    <button type="button" className="radio-programming-channel-menu-item" onClick={handleDeactivate} disabled={channelActionState.status === "pending"}>
                      Deactivate
                    </button>
                  ) : (
                    <button type="button" className="radio-programming-channel-menu-item" onClick={handleActivate} disabled={channelActionState.status === "pending"}>
                      Activate
                    </button>
                  )}
                  <button type="button" className="radio-programming-channel-menu-item radio-programming-channel-menu-item--danger" onClick={handleDelete} disabled={channelActionState.status === "pending"}>
                    Delete
                  </button>
                  {channelActionState.status === "error" && <p className="radio-diff-note">{channelActionState.message}</p>}
                </div>
              )}
            </span>
          )}
        </label>
      </div>

      {loadError && <p className="radio-diff-note">Failed to load: {loadError}</p>}

      {guide && (
        <div className="radio-programming-guide">
          <span><strong>Now:</strong> {guide.now.status === "on-air" ? `${guide.now.title} (${guide.now.source})` : `Off-air — ${guide.now.reason}`}</span>
          <span><strong>Next:</strong> {guide.next ? `${guide.next.title} at ${fmtTime(guide.next.startAtMs)} on ${fmtDayHeader(guide.next.startAtMs)}` : "Nothing scheduled"}</span>
          <span><strong>Upcoming:</strong> {guide.upcoming.length} scheduled in the next 14 days</span>
        </div>
      )}

      <div className="radio-programming-week-nav">
        <button className="npw-btn npw-btn--ghost" onClick={() => setWeekAnchorMs((w) => w - 7 * DAY_MS)}>← Previous Week</button>
        <button className="npw-btn npw-btn--ghost" onClick={() => setWeekAnchorMs(startOfWeekMs(Date.now()))}>This Week</button>
        <span className="radio-programming-week-label">{fmtWeekRange(weekAnchorMs)}</span>
        <button className="npw-btn npw-btn--ghost" onClick={() => setWeekAnchorMs((w) => w + 7 * DAY_MS)}>Next Week →</button>
      </div>

      {!isAuthorizedOperator && (
        <p className="radio-diff-note radio-programming-operator-gate">
          {memberState.status === "signedIn" ? (
            <>
              Signed in as {memberState.authUser.email ?? "this account"}, but not as a StudioRich
              operator — scheduling is read-only.{" "}
              <button className="npw-btn npw-btn--ghost radio-diff-inline-btn" onClick={handleSignOut}>Sign Out</button>
            </>
          ) : (
            <>
              Not signed in — scheduling is read-only.{" "}
              <button className="npw-btn npw-btn--ghost radio-diff-inline-btn" onClick={handleSignIn}>
                Sign in as the StudioRich operator
              </button>
            </>
          )}
          {signInError && <span className="radio-diff-note"> {signInError}</span>}
        </p>
      )}

      <div className="radio-programming-grid" style={{ ["--radio-programming-hour-px" as string]: `${HOUR_PX}px` }}>
        <div className="radio-programming-grid-gutter">
          <div className="radio-programming-day-header" />
          {hours.map((h) => (
            <div key={h} className="radio-programming-hour-label" style={{ height: HOUR_PX }}>
              {h % 2 === 0 ? fmtHourLabel(h) : ""}
            </div>
          ))}
        </div>
        {weekDays.map((dayStartMs, dayIndex) => {
          const dayEndMs = dayStartMs + DAY_MS;
          const dayBlocks = (blocks ?? []).filter((b) => b.status !== "cancelled" && b.startAtMs < dayEndMs && b.endAtMs > dayStartMs);
          const isToday = nowMs >= dayStartMs && nowMs < dayEndMs;
          return (
            <div key={dayStartMs} className={`radio-programming-day-col${isToday ? " radio-programming-day-col--today" : ""}`}>
              <div className="radio-programming-day-header">{DAY_LABELS[dayIndex]} {fmtDayHeader(dayStartMs)}</div>
              <div className="radio-programming-day-body" style={{ height: 24 * HOUR_PX }}>
                {hours.map((h) => (
                  <button
                    key={h}
                    className="radio-programming-hour-slot"
                    style={{ height: HOUR_PX, top: h * HOUR_PX }}
                    disabled={!isAuthorizedOperator}
                    title={isAuthorizedOperator ? "+ Program" : undefined}
                    onClick={() => openCreateDialog(dayStartMs, h)}
                  />
                ))}
                {dayBlocks.map((b) => {
                  const startOffsetMs = Math.max(0, b.startAtMs - dayStartMs);
                  const endOffsetMs = Math.min(DAY_MS, b.endAtMs - dayStartMs);
                  const topPx = (startOffsetMs / 3600_000) * HOUR_PX;
                  const heightPx = Math.max(HOUR_PX / 2, ((endOffsetMs - startOffsetMs) / 3600_000) * HOUR_PX);
                  const active = findActiveScheduleBlock([b], b.channelId, nowMs) !== null;
                  return (
                    <button
                      key={b.id}
                      className={`radio-programming-block${active ? " radio-programming-block--live" : ""}`}
                      style={{ top: topPx, height: heightPx }}
                      onClick={() => openEditDialog(b)}
                      title={`${programTitleById.get(b.programId) ?? b.programId} — ${fmtTime(b.startAtMs)}–${fmtTime(b.endAtMs)}`}
                    >
                      <span className="radio-programming-block-title">{programTitleById.get(b.programId) ?? b.programId}</span>
                      <span className="radio-programming-block-time">{fmtTime(b.startAtMs)}–{fmtTime(b.endAtMs)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="radio-diff-note radio-programming-legend">
        Open/unscheduled airtime means normal Channel rotation continues uninterrupted. A scheduled block temporarily takes priority only for its own window.
      </p>

      {dialogTarget && selectedChannelId && (
        <RadioScheduleBlockDialog
          channelId={selectedChannelId}
          block={dialogTarget.block}
          initialStartAtMs={dialogTarget.startAtMs}
          initialEndAtMs={dialogTarget.endAtMs}
          existingBlocks={blocks ?? []}
          existingPrograms={programs ?? []}
          schedulablePlaylists={schedulablePlaylists}
          getScheduleRepository={getScheduleRepository}
          getEventRadioRepository={getEventRadioRepository}
          onClose={() => setDialogTarget(null)}
          onSaved={() => { setDialogTarget(null); void reloadSchedule(); }}
        />
      )}

      {showNewChannelDialog && (
        <RadioNewChannelDialog
          getChannelRepository={getChannelRepository}
          onClose={() => setShowNewChannelDialog(false)}
          onCreated={(created) => {
            setShowNewChannelDialog(false);
            setChannels((prev) => [...(prev ?? []), created]);
            setSelectedChannelId(created.channelId);
          }}
        />
      )}

      {showRenameDialog && selectedChannel && (
        <RadioRenameChannelDialog
          channel={selectedChannel}
          getChannelRepository={getChannelRepository}
          onClose={() => setShowRenameDialog(false)}
          onRenamed={(updated) => {
            setShowRenameDialog(false);
            setChannels((prev) => (prev ?? []).map((c) => (c.channelId === updated.channelId ? updated : c)));
          }}
        />
      )}
    </div>
  );
}
