// Playlist flow curve analysis (0711_MUSIC_Playlist_Flow_Curve_Analysis_Rebind).
// Derives a read-only analysis directly from actual playlist output slots —
// no generated/ideal curve values. Every point here maps 1:1 to a real
// TrackSlot; if a track has no usable energy, the point says so instead of
// pretending. This is analysis infrastructure (Wizard = create, Flow Curve =
// analyze), not a generation control.

import type { TrackSlot } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";
import type { TrackEligibilityContext } from "../logic/trackEligibility";
import { getTrackEligibility } from "../logic/trackEligibility";
import { findPlaylistDuplicates } from "./playlistDuplicateGuard";

export type PlaylistFlowWarningKind =
  | "energy_jump"
  | "energy_drop"
  | "missing_energy"
  | "bpm_jump"
  | "key_shift"
  | "short_section"
  | "codec_blocked"
  | "missing_audio"
  | "duplicate_track"
  | "duplicate_song";

export type PlaylistFlowWarning = {
  kind: PlaylistFlowWarningKind;
  severity: "red" | "yellow";
  message: string;
};

export type PlaylistFlowPoint = {
  slotIndex: number;
  trackId: string;
  title: string;
  artist?: string;
  sectionLabel?: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  energy: number | null;
  bpm?: number;
  key?: string;
  rating?: number;
  warnings: PlaylistFlowWarning[];
};

export type PlaylistFlowSectionSummary = {
  label: string;
  startSlotIndex: number;
  endSlotIndex: number;
  startSeconds: number;
  endSeconds: number;
  trackCount: number;
  averageEnergy: number | null;
  minEnergy: number | null;
  maxEnergy: number | null;
  warningCount: number;
};

export type PlaylistFlowAnalysis = {
  points: PlaylistFlowPoint[];
  sections: PlaylistFlowSectionSummary[];
  totalDurationSeconds: number;
  redCount: number;
  yellowCount: number;
  missingEnergyCount: number;
};

// ── Thresholds (spec §Warning Logic) ─────────────────────────────────────────

const ENERGY_JUMP_YELLOW = 0.25;
const ENERGY_JUMP_RED = 0.40;

function hasUsableEnergy(track: Track): boolean {
  // Track.energy is a required number; the import/stub sentinel for "not yet
  // analyzed" is 0 with energySource "estimated". A real energy reading is
  // always > 0 in practice, so this is a clear, cheap incomplete-data signal
  // rather than a smoothed/invented value.
  return typeof track.energy === "number" && track.energy > 0;
}

function fmtTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}
export { fmtTimestamp as formatFlowTimestamp };

/**
 * Computes a PlaylistFlowAnalysis directly from actual playlist slots. Pass
 * the same eligibilityContext used to gate generation so codec/missing-audio
 * tracks are flagged the same way here as everywhere else in the app.
 */
export function computeFlowAnalysis(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
  eligibilityContext?: TrackEligibilityContext,
): PlaylistFlowAnalysis {
  const assigned = slots.filter((s) => s.assignedTrackId);
  const points: PlaylistFlowPoint[] = [];

  // Duplicate use (0711_MUSIC_Playlist_Duplicate_Track_Guard §Flow Curve
  // Integration) — analyzer-only exposure of an older/leaked playlist's
  // duplicate use. Generators already prevent this; this just flags it if it
  // somehow still exists, computed globally across the whole playlist, not
  // just between adjacent tracks.
  const duplicateReport = findPlaylistDuplicates(assigned, tracksById);
  const exactDuplicateSlotIndexes = new Set(duplicateReport.exactTrackDuplicates.flatMap((d) => d.slotIndexes));
  const canonicalDuplicateSlotIndexes = new Set(duplicateReport.canonicalSongDuplicates.flatMap((d) => d.slotIndexes));

  let cumulative = 0;
  let prevEnergy: number | null = null;

  for (const slot of assigned) {
    const track = tracksById.get(slot.assignedTrackId!);
    const durationSeconds = track?.durationSeconds ?? 0;
    const startSeconds = cumulative;
    const endSeconds = cumulative + durationSeconds;
    cumulative = endSeconds;

    const warnings: PlaylistFlowWarning[] = [];
    const energy = track && hasUsableEnergy(track) ? track.energy : null;

    if (exactDuplicateSlotIndexes.has(slot.slotIndex)) {
      warnings.push({ kind: "duplicate_track", severity: "red", message: "This exact track appears more than once in this playlist." });
    } else if (canonicalDuplicateSlotIndexes.has(slot.slotIndex)) {
      warnings.push({ kind: "duplicate_song", severity: "red", message: "This song appears more than once in this playlist (different file/track ID)." });
    }

    if (!track) {
      warnings.push({ kind: "missing_audio", severity: "red", message: "Assigned track not found in library." });
    } else {
      if (energy === null) {
        warnings.push({ kind: "missing_energy", severity: "yellow", message: "Track has no usable energy value." });
      } else if (prevEnergy !== null) {
        const delta = energy - prevEnergy;
        if (Math.abs(delta) >= ENERGY_JUMP_RED) {
          warnings.push({
            kind: delta > 0 ? "energy_jump" : "energy_drop",
            severity: "red",
            message: `Large energy ${delta > 0 ? "jump" : "drop"} from previous track (${prevEnergy.toFixed(2)} → ${energy.toFixed(2)}).`,
          });
        } else if (Math.abs(delta) >= ENERGY_JUMP_YELLOW) {
          warnings.push({
            kind: delta > 0 ? "energy_jump" : "energy_drop",
            severity: "yellow",
            message: `Energy ${delta > 0 ? "jump" : "drop"} from previous track (${prevEnergy.toFixed(2)} → ${energy.toFixed(2)}).`,
          });
        }
      }

      if (eligibilityContext) {
        const elig = getTrackEligibility(track, eligibilityContext);
        if (!elig.eligible) {
          if (elig.reasons.includes("codec")) {
            warnings.push({ kind: "codec_blocked", severity: "red", message: "Codec-blocked track present in playlist output — should not happen if the generator gate worked." });
          } else if (elig.reasons.includes("missing_audio")) {
            warnings.push({ kind: "missing_audio", severity: "red", message: "Missing-audio track present in playlist output — should not happen if the generator gate worked." });
          }
        }
      }
    }

    if (energy !== null) prevEnergy = energy;

    points.push({
      slotIndex: slot.slotIndex,
      trackId: slot.assignedTrackId!,
      title: track?.title ?? "(missing track)",
      artist: track?.artist,
      sectionLabel: slot.sectionLabel,
      startSeconds,
      endSeconds,
      durationSeconds,
      energy,
      bpm: track?.bpm,
      key: track?.camelotKey,
      rating: track?.rating,
      warnings,
    });
  }

  // ── Section summaries ──
  const sections: PlaylistFlowSectionSummary[] = [];
  let sectionStart = 0;
  for (let i = 0; i < points.length; i++) {
    const isLast = i === points.length - 1;
    const nextLabel = !isLast ? (points[i + 1].sectionLabel ?? "Playlist") : null;
    const thisLabel = points[i].sectionLabel ?? "Playlist";
    if (isLast || nextLabel !== thisLabel) {
      const group = points.slice(sectionStart, i + 1);
      const energies = group.map((p) => p.energy).filter((e): e is number => e !== null);
      sections.push({
        label: thisLabel,
        startSlotIndex: group[0].slotIndex,
        endSlotIndex: group[group.length - 1].slotIndex,
        startSeconds: group[0].startSeconds,
        endSeconds: group[group.length - 1].endSeconds,
        trackCount: group.length,
        averageEnergy: energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : null,
        minEnergy: energies.length ? Math.min(...energies) : null,
        maxEnergy: energies.length ? Math.max(...energies) : null,
        warningCount: group.reduce((s, p) => s + p.warnings.length, 0),
      });
      sectionStart = i + 1;
    }
  }

  const redCount = points.reduce((s, p) => s + p.warnings.filter((w) => w.severity === "red").length, 0);
  const yellowCount = points.reduce((s, p) => s + p.warnings.filter((w) => w.severity === "yellow").length, 0);
  const missingEnergyCount = points.filter((p) => p.energy === null).length;

  return {
    points,
    sections,
    totalDurationSeconds: cumulative,
    redCount,
    yellowCount,
    missingEnergyCount,
  };
}

// ── Movement profile label (spec §Analysis Summary) ─────────────────────────

export type PlaylistFlowMovementLabel = "Smooth" | "Most Movement" | "Uneven" | "Flat" | "Needs Review";

export function classifyMovement(analysis: PlaylistFlowAnalysis): PlaylistFlowMovementLabel {
  const energies = analysis.points.map((p) => p.energy).filter((e): e is number => e !== null);
  if (energies.length < 2) return "Needs Review";
  if (analysis.redCount > 0 || analysis.missingEnergyCount > energies.length * 0.3) return "Needs Review";

  let totalDelta = 0;
  let maxDelta = 0;
  for (let i = 1; i < energies.length; i++) {
    const d = Math.abs(energies[i] - energies[i - 1]);
    totalDelta += d;
    maxDelta = Math.max(maxDelta, d);
  }
  const avgDelta = totalDelta / (energies.length - 1);

  if (avgDelta < 0.05) return "Flat";
  if (maxDelta >= ENERGY_JUMP_RED) return "Uneven";
  if (avgDelta >= 0.12) return "Most Movement";
  return "Smooth";
}
