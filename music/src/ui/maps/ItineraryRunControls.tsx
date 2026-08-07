import { useEffect, useState } from "react";
import * as wallItineraryRunBridge from "../../maps/wallItineraryRunBridge";
import { computeRunReadiness, buildItineraryRunPayload } from "../../logic/maps/itineraryRunReadiness";
import type { Itinerary } from "../../data/itineraryTypes";
import type { ItineraryRunSnapshot } from "../../data/itineraryRunTypes";
import {
  PLAYBACK_RATE_PRESETS,
  PLAYBACK_RATE_DEFAULT,
  HERO_ALTITUDE_MIN_M,
  HERO_ALTITUDE_MAX_M,
  HERO_ALTITUDE_DEFAULT_M,
  HERO_VISUAL_LIFT_MIN_PX,
  HERO_VISUAL_LIFT_MAX_PX,
  HERO_VISUAL_LIFT_DEFAULT_PX,
} from "../../data/itineraryRunTypes";
import { Icon } from "../Icon";

// 0730D_MAPS_Itinerary_Runner_and_Active_Orb_Traversal — shared Run/Pause/
// Resume/Stop/Restart + telemetry, used both compactly (grid card) and fully
// (editor header). Talks to the runner ONLY through wallItineraryRunBridge —
// the actual runner executes on canonical LIVE MAP, never in this page.
//
// 0805A — Run now opens/focuses canonical LIVE MAP and waits for a genuine
// readiness handshake before sending Start (music/src/maps/
// wallItineraryRunBridge.ts's openOrFocusLiveMap()) — the user no longer has
// to manually discover or prepare the LIVE MAP window. Adds a Visual Lift
// slider (a second, independent presentation offset from Hero Height) and a
// dual-sourced presentation-warning banner: `launchError` (local state, only
// ever relevant before a run/snapshot exists — openOrFocusLiveMap() can't
// attach a warning to a snapshot that doesn't exist yet) vs. the live
// snapshot's own `presentationWarning` (only ever 'orb_unavailable' in
// practice) once actually running. The two sources never overlap in the UI
// since they render from mutually-exclusive branches below.

const REASON_LABELS: Record<string, string> = {
  missing_selected_route: "One or more stages has no routed leg yet",
  unsupported_mode: "One or more stages uses an unsupported travel mode",
  invalid_geometry: "One or more stages has invalid route geometry",
  missing_stage: "Add at least two destinations to run this itinerary",
  run_already_active: "Another itinerary is already running",
};

const LAUNCH_ERROR_LABELS: Record<"popup_blocked" | "timeout", string> = {
  popup_blocked: "Couldn't open LIVE MAP — your browser blocked the popup. Allow popups for this site and try again.",
  timeout: "LIVE MAP didn't report ready in time. Check that it opened correctly, then try again.",
};

const PRESENTATION_WARNING_LABELS: Record<string, string> = {
  orb_unavailable: "Orb unavailable — traversal continuing without visible hero",
};

function fmtClock(seconds: number | null): string {
  if (seconds == null || !isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fmtDistance(meters: number | null): string {
  if (meters == null || !isFinite(meters)) return "—";
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

function PresentationWarningBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="itin-run-warning">{text}</div>;
}

// 0730E — shared speed-preset row + hero-height slider. 0805A adds a Visual
// Lift slider. Rendered both pre-Start (local component state; the values
// Start is called with) and while Running/Paused (backed by the live
// snapshot; edits call the bridge's live setters immediately) — one control,
// two moments of use. Never rendered in compact mode.
function RunPresentationControls({
  rate,
  altitudeMeters,
  liftPixels,
  onRateChange,
  onAltitudeChange,
  onLiftChange,
}: {
  rate: number;
  altitudeMeters: number;
  liftPixels: number;
  onRateChange: (rate: number) => void;
  onAltitudeChange: (meters: number) => void;
  onLiftChange: (pixels: number) => void;
}) {
  return (
    <div className="itin-run-presentation">
      <div className="itin-run-presentation-row">
        <span className="itin-run-presentation-label">Speed</span>
        <div className="itin-run-rate-presets">
          {PLAYBACK_RATE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`itin-run-rate-btn${preset === rate ? " itin-run-rate-btn--active" : ""}`}
              onClick={() => onRateChange(preset)}
            >
              {preset}×
            </button>
          ))}
        </div>
      </div>
      <div className="itin-run-presentation-row">
        <span className="itin-run-presentation-label">Hero height</span>
        <input
          type="range"
          className="itin-run-altitude-slider"
          min={HERO_ALTITUDE_MIN_M}
          max={HERO_ALTITUDE_MAX_M}
          step={5}
          value={altitudeMeters}
          onChange={(e) => onAltitudeChange(Number(e.target.value))}
        />
        <span className="itin-run-altitude-value">{Math.round(altitudeMeters)}m</span>
      </div>
      <div className="itin-run-presentation-row">
        <span className="itin-run-presentation-label">Visual lift</span>
        <input
          type="range"
          className="itin-run-altitude-slider"
          min={HERO_VISUAL_LIFT_MIN_PX}
          max={HERO_VISUAL_LIFT_MAX_PX}
          step={5}
          value={liftPixels}
          onChange={(e) => onLiftChange(Number(e.target.value))}
        />
        <span className="itin-run-altitude-value">{Math.round(liftPixels)}px</span>
      </div>
    </div>
  );
}

type Props = {
  itinerary: Itinerary;
  compact?: boolean;
};

export function ItineraryRunControls({ itinerary, compact }: Props) {
  const [snapshot, setSnapshot] = useState<ItineraryRunSnapshot>(wallItineraryRunBridge.getSnapshot);
  const [hasOwner, setHasOwner] = useState(wallItineraryRunBridge.hasLiveOwner);
  // Captured only when THIS component instance is the one that clicks Run
  // (set inside the event handler, never during render/an effect) — the run
  // payload itself is always immutable regardless of this value; this is
  // purely the "show a stale-edit notice" signal. If a run was started from
  // a different component instance (e.g. the grid card), this stays null and
  // the notice conservatively doesn't show — the underlying payload
  // immutability guarantee is unaffected either way.
  const [startedUpdatedAt, setStartedUpdatedAt] = useState<string | null>(null);

  // 0730E — pre-Start selection; explicit and visible from the moment a run
  // begins (Start is always called with whatever these currently are), then
  // superseded by the live snapshot's own playbackRate/altitudeMeters once
  // running (see runningHere branch below, which reads from `snapshot`
  // directly rather than this local state).
  const [selectedRate, setSelectedRate] = useState(PLAYBACK_RATE_DEFAULT);
  const [selectedAltitude, setSelectedAltitude] = useState(HERO_ALTITUDE_DEFAULT_M);
  const [selectedLift, setSelectedLift] = useState(HERO_VISUAL_LIFT_DEFAULT_PX);

  // 0805A — launch-phase-only state. Set fresh at the start of every Run
  // attempt (never needs an effect-based clear — a fresh attempt always
  // overwrites it, and it simply never renders once `runningHere` is true,
  // since that's a completely different return branch below).
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<"popup_blocked" | "timeout" | null>(null);

  useEffect(() => {
    function refresh() {
      setSnapshot(wallItineraryRunBridge.getSnapshot());
      setHasOwner(wallItineraryRunBridge.hasLiveOwner());
    }
    const unsub = wallItineraryRunBridge.subscribe(refresh);
    // 'storage' events only fire cross-tab and some browsers coalesce bursts
    // — a light poll is a defensive fallback so telemetry doesn't visibly stall.
    const interval = window.setInterval(refresh, 1000);
    return () => { unsub(); window.clearInterval(interval); };
  }, []);

  const runningHere = snapshot.itineraryId === itinerary.id &&
    (snapshot.status === "running" || snapshot.status === "paused" || snapshot.status === "starting" || snapshot.status === "completed");

  if (runningHere) {
    const staleEdit = !compact && startedUpdatedAt != null && itinerary.updatedAt !== startedUpdatedAt;
    if (compact) {
      return <span className="itin-run-badge">{snapshot.status === "completed" ? "Completed" : snapshot.status === "paused" ? "Paused" : "Running"}</span>;
    }
    return (
      <div className="itin-run-controls">
        <div className="itin-run-status">
          <span className={`itin-run-badge itin-run-badge--${snapshot.status}`}>
            {snapshot.status === "completed" ? "Completed" : snapshot.status === "paused" ? "Paused" : snapshot.status === "error" ? "Error" : "Running"}
          </span>
          {snapshot.stageCount > 0 && (
            <span className="itin-run-stage">Stage {snapshot.stageIndex + 1} of {snapshot.stageCount}</span>
          )}
        </div>
        <div className="itin-run-telemetry">
          <span>Elapsed {fmtClock(snapshot.elapsedSeconds)}</span>
          <span>Remaining {fmtClock(snapshot.estimatedRemainingSeconds)}</span>
          <span>{fmtDistance(snapshot.distanceRemainingMeters)} left</span>
        </div>
        {snapshot.errorMessage && <div className="itin-run-error">{snapshot.errorMessage}</div>}
        {staleEdit && <div className="itin-run-stale">Itinerary changed since run started — changes apply to the next run.</div>}
        <PresentationWarningBanner text={snapshot.presentationWarning ? PRESENTATION_WARNING_LABELS[snapshot.presentationWarning] ?? null : null} />
        {(snapshot.status === "running" || snapshot.status === "paused") && (
          <RunPresentationControls
            rate={snapshot.playbackRate}
            altitudeMeters={snapshot.altitudeMeters}
            liftPixels={snapshot.heroVisualLiftPixels}
            onRateChange={(rate) => wallItineraryRunBridge.setPlaybackRate(rate)}
            onAltitudeChange={(meters) => wallItineraryRunBridge.setHeroAltitude(meters)}
            onLiftChange={(pixels) => wallItineraryRunBridge.setHeroVisualLift(pixels)}
          />
        )}
        <div className="itin-run-actions">
          {snapshot.status === "running" && (
            <button className="tb-btn sm" onClick={() => wallItineraryRunBridge.pause()}>Pause</button>
          )}
          {snapshot.status === "paused" && (
            <button className="tb-btn sm" onClick={() => wallItineraryRunBridge.resume()}>Resume</button>
          )}
          {/* Available through Completed — the final position is retained on
              completion, so Locate Hero staying reachable there is
              consistent, not an exception. No continuous follow. */}
          <button className="tb-btn sm" onClick={() => wallItineraryRunBridge.locateHero()}>Locate Hero</button>
          {/* 0730F — explicit toggle; --active reflects the live snapshot, so a
              manual map drag on canonical LIVE MAP (which disables follow
              there) is visibly reflected here too, not just silently reset. */}
          <button
            className={`tb-btn sm${snapshot.followHeroEnabled ? " itin-run-toggle-btn--active" : ""}`}
            onClick={() => wallItineraryRunBridge.setFollowHero(!snapshot.followHeroEnabled)}
          >
            {snapshot.followHeroEnabled ? "Following" : "Follow Hero"}
          </button>
          <button className="tb-btn sm" onClick={() => { wallItineraryRunBridge.stop(); setStartedUpdatedAt(null); }}>
            {snapshot.status === "completed" ? "Return to Idle" : "Stop"}
          </button>
          <button className="tb-btn sm" onClick={() => { wallItineraryRunBridge.restart(); setStartedUpdatedAt(itinerary.updatedAt); }}>Restart</button>
        </div>
      </div>
    );
  }

  const otherRunActive = hasOwner && snapshot.itineraryId !== itinerary.id &&
    (snapshot.status === "running" || snapshot.status === "paused" || snapshot.status === "starting");
  const { ready, reasons } = computeRunReadiness(itinerary, otherRunActive);
  const blockReason = reasons.length ? REASON_LABELS[reasons[0]] ?? "Unable to run" : undefined;

  // 0805A — opens/focuses canonical LIVE MAP and waits for its readiness
  // handshake BEFORE sending Start; the run itself only ever begins once
  // LIVE MAP has confirmed it's ready to receive it.
  async function handleRun() {
    const payload = buildItineraryRunPayload(itinerary);
    if (!payload) return;
    setLaunchError(null);
    setLaunching(true);
    const result = await wallItineraryRunBridge.openOrFocusLiveMap();
    setLaunching(false);
    if (!result.ok) {
      setLaunchError(result.reason);
      return;
    }
    setStartedUpdatedAt(itinerary.updatedAt);
    // Follow Hero enabled by default for the automatic launch path — the run
    // itself starts immediately; Locate then Follow engage wall-side, in
    // sequence, once LIVE MAP applies the command (see itineraryRunAuthority.js).
    wallItineraryRunBridge.start(payload, selectedRate, selectedAltitude, selectedLift, true);
  }

  const runDisabled = !ready || launching;
  const runTitle = !ready ? blockReason : launching ? "Opening LIVE MAP…" : undefined;

  if (compact) {
    return (
      <button className="pgc-ha-btn" title={runTitle ?? "Run"} disabled={runDisabled} onClick={handleRun}>
        <Icon name="route" />
      </button>
    );
  }

  return (
    <div className="itin-run-pre-start">
      <RunPresentationControls
        rate={selectedRate}
        altitudeMeters={selectedAltitude}
        liftPixels={selectedLift}
        onRateChange={setSelectedRate}
        onAltitudeChange={setSelectedAltitude}
        onLiftChange={setSelectedLift}
      />
      <PresentationWarningBanner text={launchError ? LAUNCH_ERROR_LABELS[launchError] : null} />
      <button className="tb-btn" disabled={runDisabled} title={runTitle} onClick={handleRun}>
        {launching ? "Opening LIVE MAP…" : "Run Itinerary"}
      </button>
    </div>
  );
}
