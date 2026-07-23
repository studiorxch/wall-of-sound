// 0722C_MUSIC_Production_Stem_Export — the inline stem sublayer. Expands
// beneath a Library row (or opens from TrackInspector's "Export Stems"
// button) for one track. Owns the export job lifecycle, synchronized
// playback, Finder reveal, and the three downstream destination buttons
// (only Send to Looper is real — see stemDownstreamActions.ts).

import { useEffect, useRef, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { StemJob, StemRole, StemSetLifecycleResult, TrackStemSet } from "../../data/trackStemTypes";
import { STEM_ROLES } from "../../data/trackStemTypes";
import {
  fetchStemSets, startStemExport, fetchStemJobStatus, cancelStemExport, revealStemSetInFinder, resolveTrackAudioIdentifier,
} from "../../logic/stems/stemClient";
import { canSendToLooper, canShowInFinder, canPlaySynchronized, canReStem, BANK_UNAVAILABLE_REASON, RADIO_UNAVAILABLE_REASON } from "../../logic/stems/stemDownstreamActions";
import { buildStemLooperSourceTrack, stemAssetUrl } from "../../logic/stems/stemLooperSource";
import { StemPlaybackEngine } from "../../audio/stemPlaybackEngine";
import { StemRoleRow } from "./StemRoleRow";

const JOB_ACTIVE_STATUSES = new Set(["queued", "preparing", "separating", "validating", "archiving"]);

const LIFECYCLE_LABEL: Record<string, string> = {
  current: "Current", outdated: "Outdated — parent audio changed", orphaned: "Orphaned — parent missing",
  unavailable: "Unavailable — archive files missing", archived: "Archived (historical)",
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  track: Track;
  onClose: () => void;
  onSendToLooper: (parentTrack: Track, syntheticTrack: Track, stemSetId: string, role: StemRole) => void;
}

export function StemSublayer({ track, onClose, onSendToLooper }: Props) {
  const audioRelPath = resolveTrackAudioIdentifier(track) ?? "";
  const [sets, setSets] = useState<TrackStemSet[]>([]);
  const [lifecycles, setLifecycles] = useState<Record<string, StemSetLifecycleResult>>({});
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<StemJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState<Partial<Record<StemRole, boolean>>>({});
  const [soloed, setSoloed] = useState<Partial<Record<StemRole, boolean>>>({});
  const [duration, setDuration] = useState(0);

  const engineRef = useRef<StemPlaybackEngine | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const currentSet = sets.find((s) => lifecycles[s.id]?.lifecycle === "current") ?? null;

  async function refresh() {
    if (!audioRelPath) { setLoading(false); return; }
    setLoading(true);
    const res = await fetchStemSets(track.trackId, audioRelPath);
    if (res.ok) { setSets(res.sets); setLifecycles(res.lifecycles); }
    setLoading(false);
  }

  useEffect(() => {
    void (async () => {
      if (!audioRelPath) { setLoading(false); return; }
      setLoading(true);
      const res = await fetchStemSets(track.trackId, audioRelPath);
      if (res.ok) { setSets(res.sets); setLifecycles(res.lifecycles); }
      setLoading(false);
    })();
  }, [track.trackId, audioRelPath]);

  // Poll the active job until it leaves an active status.
  useEffect(() => {
    if (!job || !JOB_ACTIVE_STATUSES.has(job.status)) return;
    const id = window.setInterval(async () => {
      const res = await fetchStemJobStatus(job.jobId);
      if (!res.ok || !res.job) return;
      setJob(res.job);
      if (!JOB_ACTIVE_STATUSES.has(res.job.status)) {
        window.clearInterval(id);
        if (res.job.status === "failed") setError(res.job.error ?? "Stem export failed.");
        void refresh();
      }
    }, 1500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.jobId, job?.status]);

  // rAF-driven playhead — never React state for the per-frame position
  // (matches LoopchainOverviewWaveform's established doctrine).
  useEffect(() => {
    function tick() {
      const engine = engineRef.current;
      if (engine && playheadRef.current && duration > 0) {
        const pct = Math.min(1, engine.elapsedSeconds() / duration);
        playheadRef.current.style.transform = `scaleX(${pct})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [duration]);

  useEffect(() => () => { engineRef.current?.stop(); }, []);

  async function handleExport() {
    setError(null);
    const res = await startStemExport(track.trackId, audioRelPath);
    if (!res.ok || !res.jobId) { setError(res.error ?? "Could not start stem export."); return; }
    const status = await fetchStemJobStatus(res.jobId);
    if (status.ok && status.job) setJob(status.job);
  }

  async function handleCancel() {
    if (!job) return;
    await cancelStemExport(job.jobId);
  }

  async function ensureEngineLoaded(set: TrackStemSet): Promise<StemPlaybackEngine | null> {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    if (!engineRef.current) engineRef.current = new StemPlaybackEngine({ audioContext: ctx });
    const engine = engineRef.current;
    if (engine.hasAllFourBuffers()) return engine;

    for (const role of STEM_ROLES) {
      const url = stemAssetUrl(track.trackId, audioRelPath, set.id, role);
      const res = await fetch(url);
      if (!res.ok) { setError(`Could not load ${role} — the set may no longer be current.`); return null; }
      const arrayBuf = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuf);
      engine.setBuffer(role, buffer);
    }
    setDuration(engine.getDurationSeconds());
    return engine;
  }

  async function handlePlayAll() {
    if (!currentSet || !canPlaySynchronized(lifecycles[currentSet.id]?.lifecycle)) return;
    // Revalidate CURRENT again right before starting, not just at load.
    const fresh = await fetchStemSets(track.trackId, audioRelPath);
    if (!fresh.ok || fresh.lifecycles[currentSet.id]?.lifecycle !== "current") {
      setError("This set is no longer current — playback refused.");
      void refresh();
      return;
    }
    const engine = await ensureEngineLoaded(currentSet);
    if (!engine) return;
    engine.play();
    setIsPlaying(true);
  }

  function handlePause() {
    engineRef.current?.pause();
    setIsPlaying(false);
  }

  function toggleMute(role: StemRole) {
    const next = !muted[role];
    setMuted((m) => ({ ...m, [role]: next }));
    engineRef.current?.setMuted(role, next);
  }

  function toggleSolo(role: StemRole) {
    const next = !soloed[role];
    setSoloed((s) => ({ ...s, [role]: next }));
    engineRef.current?.setSoloed(role, next);
  }

  async function handleReveal(stemSetId: string) {
    await revealStemSetInFinder(track.trackId, stemSetId);
  }

  function handleSendToLooper(role: StemRole) {
    if (!currentSet || !canSendToLooper(lifecycles[currentSet.id]?.lifecycle)) return;
    const synthetic = buildStemLooperSourceTrack(track, audioRelPath, currentSet, role);
    onSendToLooper(track, synthetic, currentSet.id, role);
  }

  const currentLifecycle = currentSet ? lifecycles[currentSet.id] : undefined;
  const historicalSets = sets.filter((s) => s.id !== currentSet?.id);

  return (
    <div className="stem-sublayer" role="region" aria-label={`Stems for ${track.title}`}>
      <div className="stem-sublayer-header">
        <span className="stem-sublayer-title">Stems — {track.title}</span>
        <button type="button" className="tb-btn" onClick={onClose}>Close</button>
      </div>

      {error && <div className="stem-sublayer-error">{error}</div>}

      {loading ? (
        <div className="stem-sublayer-status">Loading…</div>
      ) : job && JOB_ACTIVE_STATUSES.has(job.status) ? (
        <div className="stem-sublayer-job">
          <span>{job.status === "preparing" ? "Preparing stem model" : `Exporting Stems… (${job.phase ?? job.status})`}</span>
          <button type="button" className="tb-btn" onClick={handleCancel}>Cancel Stem Export</button>
        </div>
      ) : currentSet ? (
        <>
          <div className="stem-sublayer-status">
            {LIFECYCLE_LABEL[currentLifecycle?.lifecycle ?? ""] ?? "Unknown"}
            {currentLifecycle?.reason ? ` — ${currentLifecycle.reason}` : ""}
          </div>

          <div className="stem-sublayer-transport">
            <button type="button" className="tb-btn" onClick={isPlaying ? handlePause : handlePlayAll} disabled={!canPlaySynchronized(currentLifecycle?.lifecycle)}>
              {isPlaying ? "Pause" : "Play All Stems"}
            </button>
            <div
              className="stem-sublayer-progress-track"
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={duration}
              tabIndex={canPlaySynchronized(currentLifecycle?.lifecycle) && duration > 0 ? 0 : -1}
              onClick={(e) => {
                const engine = engineRef.current;
                if (!engine || duration <= 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                engine.seek(pct * duration);
              }}
            >
              <div ref={playheadRef} className="stem-sublayer-progress-fill" />
            </div>
            <span className="stem-sublayer-duration">{formatTime(duration)}</span>
          </div>

          <div className="stem-role-list">
            {STEM_ROLES.map((role) => (
              <StemRoleRow
                key={role}
                role={role}
                file={currentSet.stems[role]}
                muted={Boolean(muted[role])}
                soloed={Boolean(soloed[role])}
                onToggleMute={toggleMute}
                onToggleSolo={toggleSolo}
              />
            ))}
          </div>

          <div className="stem-sublayer-actions">
            <button type="button" className="tb-btn" disabled={!canShowInFinder(currentLifecycle?.lifecycle)} onClick={() => handleReveal(currentSet.id)}>
              Show Stems in Finder
            </button>
            <div className="stem-sublayer-downstream">
              <span className="stem-sublayer-downstream-label">Send to Looper:</span>
              {STEM_ROLES.map((role) => (
                <button key={role} type="button" className="tb-btn" disabled={!canSendToLooper(currentLifecycle?.lifecycle)} onClick={() => handleSendToLooper(role)}>
                  {role}
                </button>
              ))}
            </div>
            <button type="button" className="tb-btn" disabled title={BANK_UNAVAILABLE_REASON}>Add to Bank</button>
            <button type="button" className="tb-btn" disabled title={RADIO_UNAVAILABLE_REASON}>Prepare for RADIO</button>
            <button type="button" className="tb-btn" onClick={handleExport}>Export Stems Again…</button>
          </div>
        </>
      ) : sets.length > 0 ? (
        <div className="stem-sublayer-status">
          No current stem set — {sets.length} historical set(s) below.
          <button type="button" className="tb-btn" onClick={handleExport}>Re-stem Current Parent</button>
        </div>
      ) : (
        <div className="stem-sublayer-status">
          No stems yet for this track.
          <button type="button" className="tb-btn" onClick={handleExport}>Export Stems</button>
        </div>
      )}

      {historicalSets.length > 0 && (
        <div className="stem-sublayer-history">
          <div className="stem-sublayer-history-title">Archived stem-set history</div>
          {historicalSets.map((s) => {
            const lifecycle = lifecycles[s.id];
            return (
              <div key={s.id} className="stem-sublayer-history-row">
                <span>{s.createdAt} · {s.origin} · {LIFECYCLE_LABEL[lifecycle?.lifecycle ?? ""] ?? "Unknown"}</span>
                <button type="button" className="tb-btn" disabled={!canShowInFinder(lifecycle?.lifecycle)} onClick={() => handleReveal(s.id)}>Reveal</button>
                {canReStem(lifecycle?.lifecycle) && <button type="button" className="tb-btn" onClick={handleExport}>Re-stem Current Parent</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
