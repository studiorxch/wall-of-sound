import { useEffect, useMemo, useRef, useState } from "react";
import * as raceCourseStore from "../../maps/raceCourseStore";
import * as itineraryStore from "../../maps/itineraryStore";
import * as raceLaneStore from "../../maps/raceLaneStore";
import * as racetrackCoursePackageStore from "../../maps/racetrackCoursePackageStore";
import * as gameFormatStore from "../../maps/gameFormatStore";
import * as competitorProfileStore from "../../maps/competitorProfileStore";
import type { RacetrackCoursePackage } from "../../data/racetrackCoursePackageTypes";
import { buildRaceCourseFromItinerary } from "../../logic/maps/raceCourseConversion";
import { computeRaceCourseReadiness } from "../../logic/maps/raceCourseReadiness";
import { computeRaceLaneReadiness } from "../../logic/maps/raceLaneReadiness";
import { RaceLaneSourceCourseError } from "../../logic/maps/raceLaneGeneration";
import { decimateForPreview, buildRaceLaneTrackPolygon } from "../../logic/maps/raceLanePreviewGeometry";
import type { RaceCourse } from "../../data/raceCourseTypes";
import {
  RACE_COURSE_TARGET_DURATION_MIN_MINUTES, RACE_COURSE_TARGET_DURATION_MAX_MINUTES,
} from "../../data/raceCourseTypes";
import type { RaceLane, RaceLanePreviewMode } from "../../data/raceLaneTypes";
import { RACE_LANE_DEFAULTS, RACE_LANE_MIN_LANE_COUNT, RACE_LANE_MAX_LANE_COUNT } from "../../data/raceLaneTypes";
import {
  dockPreviewMap, undockPreviewMap, getPreviewState, subscribePreviewState,
  setItineraryPins, setItineraryRouteLines, clearItineraryOverlay,
  setRaceLaneOverlay, clearRaceLaneOverlay,
} from "../../maps/wallMapPreview";
import { CollectionDetailBar } from "../CollectionDetailBar";

type LaneDraft = {
  laneCount: string;
  laneWidthMeters: string;
  sampleSpacingMeters: string;
  tension: string;
  cornerProtectionMeters: string;
  surfaceClearanceMeters: string;
};

function laneDraftFrom(lane: RaceLane | null): LaneDraft {
  if (!lane) {
    return {
      laneCount: String(RACE_LANE_DEFAULTS.laneCount),
      laneWidthMeters: String(RACE_LANE_DEFAULTS.laneWidthMeters),
      sampleSpacingMeters: String(RACE_LANE_DEFAULTS.sampleSpacingMeters),
      tension: String(RACE_LANE_DEFAULTS.tension),
      cornerProtectionMeters: String(RACE_LANE_DEFAULTS.cornerProtectionMeters),
      surfaceClearanceMeters: String(RACE_LANE_DEFAULTS.surfaceClearanceMeters),
    };
  }
  return {
    laneCount: String(lane.laneCount),
    laneWidthMeters: String(lane.laneWidthMeters),
    sampleSpacingMeters: String(lane.centerlineSmoothing.sampleSpacingMeters),
    tension: String(lane.centerlineSmoothing.tension),
    cornerProtectionMeters: String(lane.centerlineSmoothing.cornerProtectionMeters),
    surfaceClearanceMeters: String(lane.surfaceClearanceMeters),
  };
}

function laneDraftDiffers(draft: LaneDraft, lane: RaceLane | null): boolean {
  const persisted = laneDraftFrom(lane);
  return (Object.keys(draft) as (keyof LaneDraft)[]).some((k) => draft[k] !== persisted[k]);
}

function laneDraftToOverrides(draft: LaneDraft) {
  return {
    laneCount: Math.min(RACE_LANE_MAX_LANE_COUNT, Math.max(RACE_LANE_MIN_LANE_COUNT, Number(draft.laneCount) || RACE_LANE_DEFAULTS.laneCount)),
    laneWidthMeters: Number(draft.laneWidthMeters) || RACE_LANE_DEFAULTS.laneWidthMeters,
    sampleSpacingMeters: Number(draft.sampleSpacingMeters) || RACE_LANE_DEFAULTS.sampleSpacingMeters,
    tension: Number(draft.tension) || RACE_LANE_DEFAULTS.tension,
    cornerProtectionMeters: Number(draft.cornerProtectionMeters) || RACE_LANE_DEFAULTS.cornerProtectionMeters,
    surfaceClearanceMeters: Number(draft.surfaceClearanceMeters) || RACE_LANE_DEFAULTS.surfaceClearanceMeters,
  };
}

// 0805C_MAPS_Race_Course_Library_and_Itinerary_Conversion
//
// Reuses the same dockable preview-map + pins/route-line overlay
// MapsItineraryEditor.tsx already established — no second map runtime, per
// spec §8. Fed the COURSE's own start/checkpoints/finish + its own flattened
// centerline, not live itinerary stops. Preview is inert — nothing here ever
// calls activateRaceCourse except the explicit Activate button.

type Props = {
  courseId: string;
  onBack: () => void;
};

function fmtDistance(m: number): string {
  const miles = m / 1609.344;
  return `${miles.toFixed(2)} mi (${Math.round(m)} m)`;
}

function reasonLabel(reason: string): string {
  return reason.replace(/_/g, " ");
}

const PLAYLIST_MIRROR_KEY = "wos:musicPlaylists:catalog";

function readPlaylistMirrorAvailable(): boolean {
  try {
    const raw = localStorage.getItem(PLAYLIST_MIRROR_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

// 0805F — a small, honest "is RACETRACK actually usable yet?" readout,
// placed right where the user is already preparing to test it. Reads real
// state from each canonical store (never a hardcoded assumption), and the
// playlist row reads the MIRROR key itself (not just "does MUSIC have
// playlists") since that's the literal thing wall/'s RACETRACK runtime
// depends on.
function RacetrackPrerequisites({ coursePackage }: { coursePackage: RacetrackCoursePackage | null }) {
  const [, forceRerender] = useState(0);

  useEffect(() => {
    const bump = () => forceRerender((n) => n + 1);
    const unsubFormats = gameFormatStore.subscribe(bump);
    const unsubCompetitors = competitorProfileStore.subscribe(bump);
    const onStorage = (e: StorageEvent) => { if (e.key === PLAYLIST_MIRROR_KEY) bump(); };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubFormats();
      unsubCompetitors();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const rows: Array<{ label: string; ok: boolean }> = [
    { label: "Course Package published", ok: !!coursePackage?.publishedAt },
    { label: "Game Format available", ok: gameFormatStore.listGameFormats().length > 0 },
    { label: "Competitors available", ok: competitorProfileStore.listCompetitorProfiles().length > 0 },
    { label: "Playlist mirror available", ok: readPlaylistMirrorAvailable() },
  ];

  return (
    <>
      <div className="race-course-section-title">RACETRACK Prerequisites</div>
      <div className="race-course-list">
        {rows.map((row) => (
          <div key={row.label} className="race-course-list-row">
            <span>{row.label}</span>
            <span className={row.ok ? "race-course-active-badge" : "race-course-warning"}>{row.ok ? "Ready" : "Not yet"}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function MapsRaceCourseDetail({ courseId, onBack }: Props) {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [course, setCourse] = useState<RaceCourse | null>(() => raceCourseStore.getRaceCourse(courseId));
  const [previewMapReady, setPreviewMapReady] = useState(getPreviewState() === "ready");
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [durationDraft, setDurationDraft] = useState("");

  const [lane, setLane] = useState<RaceLane | null>(() => raceLaneStore.listRaceLanesForCourse(courseId)[0] ?? null);
  const [laneDraft, setLaneDraft] = useState<LaneDraft>(() => laneDraftFrom(raceLaneStore.listRaceLanesForCourse(courseId)[0] ?? null));
  const [laneNameDraft, setLaneNameDraft] = useState<string | null>(null);
  const [laneError, setLaneError] = useState<string | null>(null);

  const [publishedPackage, setPublishedPackage] = useState(() =>
    racetrackCoursePackageStore.getLatestCoursePackageForCourse(courseId),
  );
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    function refreshPackage() {
      setPublishedPackage(racetrackCoursePackageStore.getLatestCoursePackageForCourse(courseId));
    }
    refreshPackage();
    return racetrackCoursePackageStore.subscribe(refreshPackage);
  }, [courseId]);

  useEffect(() => {
    function refresh() { setCourse(raceCourseStore.getRaceCourse(courseId)); }
    const unsubStore = raceCourseStore.subscribe(refresh);
    const unsubPreview = subscribePreviewState((s) => setPreviewMapReady(s === "ready"));
    const el = previewContainerRef.current;
    if (el) dockPreviewMap(el);
    return () => {
      unsubStore();
      unsubPreview();
      clearItineraryOverlay();
      clearRaceLaneOverlay();
      undockPreviewMap();
    };
  }, [courseId]);

  useEffect(() => {
    function refreshLane() {
      const next = raceLaneStore.listRaceLanesForCourse(courseId)[0] ?? null;
      setLane(next);
      setLaneDraft((prev) => (laneDraftDiffers(prev, next) && next ? prev : laneDraftFrom(next)));
    }
    refreshLane();
    return raceLaneStore.subscribe(refreshLane);
  }, [courseId]);

  useEffect(() => {
    if (!course || !previewMapReady) return;
    const pins = [
      { id: course.startLine.id, longitude: course.startLine.coordinate[0], latitude: course.startLine.coordinate[1], label: "Start" },
      ...course.checkpoints.map((cp, i) => ({
        id: cp.id, longitude: cp.coordinate[0], latitude: cp.coordinate[1], label: `${i + 1}. ${cp.label}`,
      })),
      { id: course.finishLine.id, longitude: course.finishLine.coordinate[0], latitude: course.finishLine.coordinate[1], label: "Finish" },
    ];
    setItineraryPins(pins);
    setItineraryRouteLines([course.geometry]);
  }, [course, previewMapReady]);

  // Race Lane preview — always fed the DECIMATED point set, never the
  // full-resolution stored sampledCenterline (that array remains the
  // sampling API's authority only). invisible -> markers only; guide ->
  // centerline + lane-divider lines + start-grid/finish pins, no fill;
  // track -> same as guide plus a real translucent filled band.
  //
  // Pure derivation lives in useMemo (no setState here) — the self-intersect
  // fallback note is read directly off this memo in the JSX below, never
  // pushed into state from inside an effect.
  const lanePreview = useMemo(() => {
    if (!lane) return null;
    const { points: previewPoints } = decimateForPreview(lane.sampledCenterline);
    const centerCoords = previewPoints.map((s) => s.center);

    const pins = [
      ...lane.startGrid.slots.filter((s) => s.row === 0).map((s) => ({
        id: s.id, longitude: s.coordinate[0], latitude: s.coordinate[1], label: `Grid L${s.laneIndex + 1}`,
      })),
      { id: "lane-finish", longitude: lane.finishPlane.coordinate[0], latitude: lane.finishPlane.coordinate[1], label: "Lane Finish" },
    ];

    if (lane.previewMode === "invisible") {
      return { pins, lines: [] as { type: "LineString"; coordinates: [number, number][] }[], trackPolygon: null, selfIntersects: false };
    }

    const laneLines = [{ type: "LineString" as const, coordinates: centerCoords }];
    for (let i = 0; i < lane.laneCount; i++) {
      // Lane-divider line — one per lane, offset by that lane's own lateral
      // position, so adjacent lanes' boundaries are visually distinguishable.
      const offsetPoints = previewPoints.map((s) => {
        const lateral = (i - (lane.laneCount - 1) / 2) * lane.laneWidthMeters;
        const mpdLat = 111320;
        const mpdLng = Math.cos((s.center[1] * Math.PI) / 180) * 111320;
        return [
          s.center[0] + (s.normalEast * lateral) / mpdLng,
          s.center[1] + (s.normalNorth * lateral) / mpdLat,
        ] as [number, number];
      });
      laneLines.push({ type: "LineString", coordinates: offsetPoints });
    }

    let trackPolygon = null;
    let selfIntersects = false;
    if (lane.previewMode === "track") {
      const result = buildRaceLaneTrackPolygon(previewPoints, lane.laneCount, lane.laneWidthMeters);
      trackPolygon = result.polygon;
      selfIntersects = result.selfIntersects;
    }

    return { pins, lines: laneLines, trackPolygon, selfIntersects };
  }, [lane]);

  useEffect(() => {
    if (!previewMapReady) return;
    if (!lanePreview) { clearRaceLaneOverlay(); return; }
    setRaceLaneOverlay(lanePreview);
  }, [lanePreview, previewMapReady]);

  if (!course) {
    return (
      <div className="itin-editor-root">
        <div className="itin-editor-left">
          <CollectionDetailBar collectionLabel="Race Courses" onBackToCollection={onBack} />
          <div className="pg-empty-msg">Course not found.</div>
        </div>
      </div>
    );
  }

  const readiness = computeRaceCourseReadiness(course);
  const sourceItinerary = course.sourceItineraryId ? itineraryStore.getItinerary(course.sourceItineraryId) : null;
  const sourceChanged =
    !!sourceItinerary &&
    course.sourceFingerprint != null &&
    buildRaceCourseFromItinerary(sourceItinerary, course.name).course.sourceFingerprint !== course.sourceFingerprint;

  async function commitTitle() {
    const name = titleDraft?.trim();
    setTitleDraft(null);
    if (name) await raceCourseStore.renameRaceCourse(course!.id, name);
  }

  async function handleActivate() {
    await raceCourseStore.activateRaceCourse(course!.id);
  }

  async function handleDuplicate() {
    const copy = await raceCourseStore.duplicateRaceCourse(course!.id);
    if (copy) onBack(); // land back on the grid, where the new copy now appears
  }

  async function commitDuration() {
    const trimmed = durationDraft.trim();
    const minutes = trimmed === "" ? null : Number(trimmed);
    if (minutes != null && !Number.isFinite(minutes)) return;
    await raceCourseStore.setTargetDurationMinutes(course!.id, minutes);
  }

  async function handleCreateLane() {
    setLaneError(null);
    try {
      await raceLaneStore.createRaceLane(course!, laneDraftToOverrides(laneDraft));
    } catch (e) {
      setLaneError(e instanceof RaceLaneSourceCourseError ? e.message : "Could not create Race Lane.");
    }
  }

  async function handleRegenerateLane() {
    if (!lane) return;
    setLaneError(null);
    try {
      await raceLaneStore.regenerateRaceLane(lane.id, course!, laneDraftToOverrides(laneDraft));
    } catch (e) {
      setLaneError(e instanceof RaceLaneSourceCourseError ? e.message : "Could not regenerate Race Lane.");
    }
  }

  async function commitLaneName() {
    const name = laneNameDraft?.trim();
    setLaneNameDraft(null);
    if (name && lane) await raceLaneStore.renameRaceLane(lane.id, name);
  }

  async function handleDuplicateLane() {
    if (!lane) return;
    await raceLaneStore.duplicateRaceLane(lane.id);
  }

  async function handleDeleteLane() {
    if (!lane) return;
    if (confirm(`Delete Race Lane "${lane.name}"? This does not affect the Race Course.`)) {
      await raceLaneStore.deleteRaceLane(lane.id);
    }
  }

  async function handlePreviewModeChange(mode: RaceLanePreviewMode) {
    if (!lane) return;
    await raceLaneStore.setRaceLanePreviewMode(lane.id, mode);
  }

  async function handlePublishPackage() {
    if (!lane) return;
    setPublishError(null);
    try {
      const published = await racetrackCoursePackageStore.publishCoursePackage(course!, lane);
      setPublishedPackage(published);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Could not publish Course Package.");
    }
  }

  return (
    <div className="itin-editor-root">
      <div className="itin-editor-left">
        <div className="itin-editor-header">
          <CollectionDetailBar collectionLabel="Race Courses" onBackToCollection={onBack} />
        </div>

        <div className="itin-editor-header">
          {titleDraft !== null ? (
            <input
              className="cat-filter-search"
              style={{ fontSize: 18, flex: 1 }}
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setTitleDraft(null); }}
            />
          ) : (
            <h2 className="itin-editor-title" onClick={() => setTitleDraft(course.name)} title="Click to rename">
              {course.name}{course.active && <span className="race-course-active-badge"> · ACTIVE</span>}
            </h2>
          )}
          <button className="tb-btn sm" onClick={handleActivate} disabled={!readiness.ready || course.active}>
            {course.active ? "Active" : "Activate"}
          </button>
          <button className="tb-btn sm" onClick={handleDuplicate}>Duplicate</button>
        </div>

        {sourceChanged && (
          <div className="itin-run-warning race-course-warning">
            Source itinerary changed since conversion.
          </div>
        )}

        {!readiness.ready && (
          <div className="itin-run-warning race-course-warning">
            Needs review: {readiness.reasons.map(reasonLabel).join(", ")}
          </div>
        )}

        <div className="race-course-stat-row">
          <span>{fmtDistance(course.totalDistanceMeters)}</span>
          <span>{course.checkpoints.length} checkpoints</span>
          <span>{course.sections.length} sections</span>
          <span>{course.continuity.continuous ? "Continuous" : `${course.continuity.discontinuities.length} gap(s)`}</span>
        </div>

        {course.sourceItineraryName && (
          <div className="race-course-source-ref">Source itinerary: {course.sourceItineraryName}</div>
        )}

        <div className="race-course-field-row">
          <label htmlFor="race-course-target-duration">Target duration (min)</label>
          <input
            id="race-course-target-duration"
            type="number"
            min={RACE_COURSE_TARGET_DURATION_MIN_MINUTES}
            max={RACE_COURSE_TARGET_DURATION_MAX_MINUTES}
            placeholder={course.targetDurationMinutes != null ? String(course.targetDurationMinutes) : "—"}
            value={durationDraft}
            onChange={(e) => setDurationDraft(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => { if (e.key === "Enter") commitDuration(); }}
          />
        </div>

        {!course.continuity.continuous && (
          <div className="race-course-continuity-report">
            <div className="race-course-section-title">Continuity report</div>
            {course.continuity.discontinuities.map((d, i) => (
              <div key={i} className="race-course-discontinuity-row">
                After stage {d.afterStageIndex + 1}: gap of {Math.round(d.gapMeters)} m
                (from [{d.previousEnd[1].toFixed(5)}, {d.previousEnd[0].toFixed(5)}] to [{d.nextStart[1].toFixed(5)}, {d.nextStart[0].toFixed(5)}]) —
                no connector was invented.
              </div>
            ))}
          </div>
        )}

        <div className="race-course-section-title">Checkpoints</div>
        <div className="race-course-list">
          {course.checkpoints.map((cp, i) => (
            <div key={cp.id} className="race-course-list-row">
              <span>{i + 1}. {cp.label}</span>
              <span>{fmtDistance(cp.distanceMeters)}</span>
            </div>
          ))}
        </div>

        <div className="race-course-section-title">Sections</div>
        <div className="race-course-list">
          {course.sections.map((s) => (
            <div key={s.id} className="race-course-list-row">
              <span>{s.name}</span>
              <span>{fmtDistance(s.endDistanceMeters - s.startDistanceMeters)}</span>
            </div>
          ))}
        </div>

        <div className="race-course-section-title">Race Lane</div>
        {!lane ? (
          <div className="race-lane-empty">
            <button
              className="tb-btn sm"
              onClick={handleCreateLane}
              disabled={course.status !== "ready"}
              title={course.status !== "ready" ? "Course must be ready and continuous to create a Race Lane" : undefined}
            >
              Create Race Lane
            </button>
            {course.status !== "ready" && (
              <span className="race-course-warning">
                {course.status === "archived" ? "Archived courses cannot have a Race Lane." : "Course needs review before a Race Lane can be created."}
              </span>
            )}
          </div>
        ) : (
          (() => {
            const laneReadiness = computeRaceLaneReadiness(lane, course);
            const draftDirty = laneDraftDiffers(laneDraft, lane);
            return (
              <>
                <div className="itin-editor-header">
                  {laneNameDraft !== null ? (
                    <input
                      className="cat-filter-search"
                      style={{ fontSize: 15, flex: 1 }}
                      autoFocus
                      value={laneNameDraft}
                      onChange={(e) => setLaneNameDraft(e.target.value)}
                      onBlur={commitLaneName}
                      onKeyDown={(e) => { if (e.key === "Enter") commitLaneName(); if (e.key === "Escape") setLaneNameDraft(null); }}
                    />
                  ) : (
                    <span className="race-course-section-title" style={{ margin: 0 }} onClick={() => setLaneNameDraft(lane.name)} title="Click to rename">
                      {lane.name}
                    </span>
                  )}
                  <button className="tb-btn sm" onClick={handleDuplicateLane}>Duplicate</button>
                  <button className="tb-btn sm" onClick={handleDeleteLane}>Delete</button>
                </div>

                {laneError && <div className="itin-run-warning race-course-warning">{laneError}</div>}

                {lane.previewMode === "track" && lanePreview?.selfIntersects && (
                  <div className="itin-run-warning race-course-warning">
                    Track preview unavailable — lane geometry self-intersects here. Showing guide lines instead.
                  </div>
                )}

                {!laneReadiness.ready && (
                  <div className="itin-run-warning race-course-warning">
                    Needs review: {laneReadiness.reasons.map(reasonLabel).join(", ")}
                  </div>
                )}

                <div className="race-course-stat-row">
                  <span>Source: {fmtDistance(laneReadiness.diagnostics.sourceDistanceMeters)}</span>
                  <span>Sampled: {fmtDistance(laneReadiness.diagnostics.sampledDistanceMeters)}</span>
                  <span>Δ {Math.round(laneReadiness.diagnostics.distanceDeltaMeters)} m</span>
                </div>
                <div className="race-course-stat-row">
                  <span>{laneReadiness.diagnostics.sampleCount} stored samples</span>
                  <span>Mean spacing {laneReadiness.diagnostics.meanSampleSpacingMeters.toFixed(2)} m</span>
                  <span>Max spacing {laneReadiness.diagnostics.maxSampleSpacingMeters.toFixed(2)} m</span>
                </div>
                <div className="race-course-stat-row">
                  <span>{laneReadiness.diagnostics.laneCount} lanes ({laneReadiness.diagnostics.totalLaneWidthMeters} m wide)</span>
                  <span>
                    Sharpest turn radius: {laneReadiness.diagnostics.sharpestTurnRadiusMeters != null ? `${Math.round(laneReadiness.diagnostics.sharpestTurnRadiusMeters)} m` : "—"}
                  </span>
                  <span>{laneReadiness.diagnostics.offsetIntersectionCount} offset intersection(s)</span>
                </div>

                <div className="race-course-field-row">
                  <label htmlFor="race-lane-preview-mode">Preview mode</label>
                  <select
                    id="race-lane-preview-mode"
                    value={lane.previewMode}
                    onChange={(e) => handlePreviewModeChange(e.target.value as RaceLanePreviewMode)}
                  >
                    <option value="invisible">Invisible</option>
                    <option value="guide">Guide</option>
                    <option value="track">Track</option>
                  </select>
                </div>

                <div className="race-lane-draft-grid">
                  <label>
                    Lanes
                    <input type="number" min={RACE_LANE_MIN_LANE_COUNT} max={RACE_LANE_MAX_LANE_COUNT}
                      value={laneDraft.laneCount} onChange={(e) => setLaneDraft((d) => ({ ...d, laneCount: e.target.value }))} />
                  </label>
                  <label>
                    Lane width (m)
                    <input type="number" min={0.5} step={0.5}
                      value={laneDraft.laneWidthMeters} onChange={(e) => setLaneDraft((d) => ({ ...d, laneWidthMeters: e.target.value }))} />
                  </label>
                  <label>
                    Sample spacing (m)
                    <input type="number" min={0.5} step={0.5}
                      value={laneDraft.sampleSpacingMeters} onChange={(e) => setLaneDraft((d) => ({ ...d, sampleSpacingMeters: e.target.value }))} />
                  </label>
                  <label>
                    Tension
                    <input type="number" min={0} max={1} step={0.05}
                      value={laneDraft.tension} onChange={(e) => setLaneDraft((d) => ({ ...d, tension: e.target.value }))} />
                  </label>
                  <label>
                    Corner protection (m)
                    <input type="number" min={0} step={1}
                      value={laneDraft.cornerProtectionMeters} onChange={(e) => setLaneDraft((d) => ({ ...d, cornerProtectionMeters: e.target.value }))} />
                  </label>
                  <label>
                    Surface clearance (m)
                    <input type="number" min={0} step={0.5}
                      value={laneDraft.surfaceClearanceMeters} onChange={(e) => setLaneDraft((d) => ({ ...d, surfaceClearanceMeters: e.target.value }))} />
                  </label>
                </div>
                <button className="tb-btn sm" onClick={handleRegenerateLane} disabled={!draftDirty}>
                  Regenerate
                </button>

                <div className="race-course-section-title">RACETRACK Course Package</div>
                {publishError && <div className="itin-run-warning race-course-warning">{publishError}</div>}
                {/* 0805F required correction: publishing only requires
                    presentationReady — a future-runtime-only concern like
                    offset_intersection must never block the cached
                    presentation package. The warning is disclosed, not
                    hidden, via the runtimeReady note below. */}
                <div className="race-lane-empty">
                  <button className="tb-btn sm" onClick={handlePublishPackage} disabled={!laneReadiness.presentationReady}
                    title={!laneReadiness.presentationReady ? "Race Lane must be presentation-ready before publishing" : undefined}>
                    {publishedPackage ? "Republish Course Package" : "Compile & Publish Course Package"}
                  </button>
                  {publishedPackage && (
                    <span className="race-course-meta">
                      v{publishedPackage.version} · {publishedPackage.progressSamples.length} samples · published {new Date(publishedPackage.publishedAt ?? publishedPackage.createdAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {laneReadiness.presentationReady && !laneReadiness.runtimeReady && (
                  <div className="race-course-meta">
                    Presentation-ready; not yet runtime-ready for a future race: {laneReadiness.reasons.map(reasonLabel).join(", ")}
                  </div>
                )}
                {publishedPackage && publishedPackage.warnings.length > 0 && (
                  <div className="race-course-meta">
                    Published package carries runtime warnings: {publishedPackage.warnings.map(reasonLabel).join(", ")}
                  </div>
                )}

                <RacetrackPrerequisites coursePackage={publishedPackage} />
              </>
            );
          })()
        )}
      </div>

      <div className="itin-editor-right" ref={previewContainerRef}>
        {!previewMapReady && <div className="md-preview-loading">Map preview loading…</div>}
      </div>
    </div>
  );
}
