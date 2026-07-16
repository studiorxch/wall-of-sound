import type { TrackSlot, WarningLevel } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";
import { getCamelotPenalty } from "./camelot";
import { formatNumber } from "./dateFormat";

const ENERGY_YELLOW = 0.2;
const ENERGY_RED = 0.35;
const BPM_YELLOW_PCT = 0.15;
const BPM_RED_PCT = 0.3;
const CAMELOT_YELLOW = 12;
const CAMELOT_RED = 18;

export function evaluateSlotWarnings(params: {
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
}): TrackSlot[] {
  const { slots, tracksById } = params;

  return slots.map((slot, i) => {
    const messages: string[] = [];
    let level: WarningLevel = "none";

    if (!slot.assignedTrackId) {
      const bpmLow = Math.round(slot.targetBpm * 0.94);
      const bpmHigh = Math.round(slot.targetBpm * 1.06);
      const eMin = formatNumber(Math.max(0, (slot.targetEnergy ?? 0) - 0.1), 2, "?");
      const eMax = formatNumber(Math.min(1, (slot.targetEnergy ?? 0) + 0.1), 2, "?");
      messages.push(
        `Empty slot — need a track around ${bpmLow}–${bpmHigh} BPM, energy ${eMin}–${eMax}`
      );
      level = "red";
    } else {
      const track = tracksById.get(slot.assignedTrackId);
      if (!track) {
        messages.push("Assigned track not found in library");
        level = "red";
      } else {
        // Energy check
        const energyDiff = Math.abs(track.energy - slot.targetEnergy);
        if (energyDiff > ENERGY_RED) {
          messages.push(
            `Energy mismatch: track ${formatNumber(track.energy, 2)} vs target ${formatNumber(slot.targetEnergy, 2)}`
          );
          level = worst(level, "red");
        } else if (energyDiff > ENERGY_YELLOW) {
          messages.push(
            `Weak energy fit: track ${formatNumber(track.energy, 2)} vs target ${formatNumber(slot.targetEnergy, 2)}`
          );
          level = worst(level, "yellow");
        }

        // BPM check
        const bpmDiff = Math.abs(track.bpm - slot.targetBpm) / (slot.targetBpm || 1);
        if (bpmDiff > BPM_RED_PCT) {
          messages.push(
            `BPM gap: track ${track.bpm} BPM vs target ${Math.round(slot.targetBpm)} BPM`
          );
          level = worst(level, "red");
        } else if (bpmDiff > BPM_YELLOW_PCT) {
          messages.push(
            `BPM drift: track ${track.bpm} BPM vs target ${Math.round(slot.targetBpm)} BPM`
          );
          level = worst(level, "yellow");
        }

        // Camelot and adjacent BPM drift vs previous slot
        if (i > 0) {
          const prevSlot = slots[i - 1];
          if (prevSlot.assignedTrackId) {
            const prevTrack = tracksById.get(prevSlot.assignedTrackId);
            if (prevTrack) {
              const penalty = getCamelotPenalty(prevTrack.camelotKey, track.camelotKey);
              if (penalty >= CAMELOT_RED) {
                messages.push(`Risky key change: ${prevTrack.camelotKey} → ${track.camelotKey}`);
                level = worst(level, "red");
              } else if (penalty >= CAMELOT_YELLOW) {
                messages.push(`Moderate key change: ${prevTrack.camelotKey} → ${track.camelotKey}`);
                level = worst(level, "yellow");
              }

              const adjRawDiff = Math.abs(track.bpm - prevTrack.bpm);
              const adjPct = adjRawDiff / (prevTrack.bpm || 1);
              if (adjPct > 0.20) {
                messages.push(`Adjacent BPM gap: ${prevTrack.bpm}→${track.bpm} (${Math.round(adjPct * 100)}%)`);
                level = worst(level, "red");
              } else if (adjPct > 0.10) {
                messages.push(`Adjacent BPM drift: ${prevTrack.bpm}→${track.bpm} (${Math.round(adjPct * 100)}%)`);
                level = worst(level, "yellow");
              }
            }
          }
        }
      }
    }

    return { ...slot, warningLevel: level, warningMessages: messages };
  });
}

function worst(a: WarningLevel, b: WarningLevel): WarningLevel {
  if (a === "red" || b === "red") return "red";
  if (a === "yellow" || b === "yellow") return "yellow";
  return "none";
}
