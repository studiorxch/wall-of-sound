// ── racetrackCoursePackageCompiler.ts — pure Race Course+Lane → Package ───────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime, corrected 0805F
//
// compileRacetrackCoursePackage() is pure and synchronous — it reads the
// course/lane as value snapshots and never mutates either, never issues a
// network request, and never rewrites Race Course/Race Lane geometry. This
// is the ONLY place a RacetrackCoursePackage is ever produced — RACETRACK
// (wall/) never re-derives one itself, it only consumes what this function
// built.
//
// progressSamples is the lane's own full-resolution sampledCenterline,
// mapped 1:1 (never decimated) — the deterministic authority, per 0805D's
// own established discipline. previewRoute reuses decimateForPreview()
// verbatim, not reimplemented.
//
// REQUIRED CORRECTION (0805F): this function now computes the lane's own
// computeRaceLaneReadiness() internally (reusing the existing function, never
// duplicating its reason logic) and REFUSES to compile unless
// presentationReady is true — a lane that's blocked only on future
// racer/physics concerns (offset_intersection/start_grid_invalid) is still
// allowed to compile and publish; runtimeReady/warnings are carried onto the
// package honestly, never hidden.

import type { RaceCourse } from "../../data/raceCourseTypes";
import type { RaceLane } from "../../data/raceLaneTypes";
import type {
  RacetrackCoursePackage, RacetrackCourseSample, RacetrackCameraAnchor,
} from "../../data/racetrackCoursePackageTypes";
import { decimateForPreview } from "./raceLanePreviewGeometry";
import { computeRaceLaneReadiness } from "./raceLaneReadiness";

export class RacetrackCoursePackageNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RacetrackCoursePackageNotReadyError";
  }
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "course";
}

function toRacetrackSample(s: RaceLane["sampledCenterline"][number]): RacetrackCourseSample {
  return {
    index: s.index,
    distanceMeters: s.distanceMeters,
    progress01: s.progress01,
    coordinate: s.center,
    headingDeg: s.headingDeg,
  };
}

// Four cheap, static framing presets derived from the already-sampled
// centerline — pure data, no camera execution/animation logic. start/
// quarter/finish are close, angled "chase" framings; overview is a wide,
// top-down framing centered on the course's own bounding box.
function buildCameraAnchors(centerline: RaceLane["sampledCenterline"], totalDistanceMeters: number): RacetrackCameraAnchor[] {
  const n = centerline.length;
  const at = (fraction: number) => centerline[Math.min(n - 1, Math.max(0, Math.round((n - 1) * fraction)))];

  const start = at(0);
  const quarter = at(0.25);
  const finish = at(1);

  let minLng = centerline[0].center[0], maxLng = centerline[0].center[0];
  let minLat = centerline[0].center[1], maxLat = centerline[0].center[1];
  for (const s of centerline) {
    minLng = Math.min(minLng, s.center[0]); maxLng = Math.max(maxLng, s.center[0]);
    minLat = Math.min(minLat, s.center[1]); maxLat = Math.max(maxLat, s.center[1]);
  }
  const overviewCoordinate: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];

  return [
    { id: genId("anchor"), label: "Start", distanceMeters: start.distanceMeters, coordinate: start.center, headingDeg: start.headingDeg, pitch: 45, zoom: 17 },
    { id: genId("anchor"), label: "Quarter", distanceMeters: quarter.distanceMeters, coordinate: quarter.center, headingDeg: quarter.headingDeg, pitch: 45, zoom: 17 },
    { id: genId("anchor"), label: "Finish", distanceMeters: finish.distanceMeters, coordinate: finish.center, headingDeg: finish.headingDeg, pitch: 45, zoom: 17 },
    { id: genId("anchor"), label: "Overview", distanceMeters: totalDistanceMeters, coordinate: overviewCoordinate, headingDeg: 0, pitch: 0, zoom: 13 },
  ];
}

export function compileRacetrackCoursePackage(course: RaceCourse, lane: RaceLane, name?: string): RacetrackCoursePackage {
  const readiness = computeRaceLaneReadiness(lane, course);
  if (!readiness.presentationReady) {
    throw new RacetrackCoursePackageNotReadyError(
      `Race Lane "${lane.name}" is not presentation-ready: ${readiness.reasons.join(", ")}`,
    );
  }
  const warnings = readiness.reasons.filter((r) => r === "offset_intersection" || r === "start_grid_invalid");

  const centerline = lane.sampledCenterline;
  const progressSamples = centerline.map(toRacetrackSample);
  const previewRoute = decimateForPreview(centerline).points.map(toRacetrackSample);

  const startSample = centerline[0];
  const finishSample = centerline[centerline.length - 1];

  const packageName = name?.trim() || course.name;
  const now = Date.now();

  return {
    id: genId("racetrackPackage"),
    slug: slugify(packageName),
    name: packageName,
    version: 1,

    sourceRaceCourseId: course.id,
    sourceRaceCourseFingerprint: course.sourceFingerprint ?? "",

    route: course.geometry,
    progressSamples,
    previewRoute,

    start: { distanceMeters: startSample.distanceMeters, coordinate: startSample.center, headingDeg: startSample.headingDeg },
    finish: { distanceMeters: finishSample.distanceMeters, coordinate: finishSample.center, headingDeg: finishSample.headingDeg },
    checkpoints: course.checkpoints.map((cp) => ({
      id: cp.id, label: cp.label, distanceMeters: cp.distanceMeters, progress01: cp.progress01, coordinate: cp.coordinate,
    })),

    routePresentation: { lineColor: "#ff6a3d", lineWidthPx: 3, previewMode: "guide" },
    cameraAnchors: buildCameraAnchors(centerline, lane.totalDistanceMeters),

    environment: undefined,
    terrain: undefined,

    presentationReady: true,
    runtimeReady: readiness.runtimeReady,
    warnings,

    providerSource: "mapbox",

    createdAt: now,
    publishedAt: null,
  };
}
