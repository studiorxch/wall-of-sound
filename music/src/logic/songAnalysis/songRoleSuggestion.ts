// Complete Song Intelligence and Section Map (0717C) — ranked, non-binding
// arrangement-role suggestions (spec §6.3: "calculate ranked suggestions
// rather than permanent truth"). Pure, no I/O, unit-testable against
// synthetic profiles. Never writes/confirms a role automatically — the
// caller (PromoteToRadioDialog) only ever displays these as advisory
// information; the user still picks the role explicitly.

import type { RadioArrangementRole } from "../../data/radioLoopTypes";
import { RADIO_ARRANGEMENT_ROLES } from "../../data/radioLoopTypes";
import type { NumericProfile, SongRoleSuggestion, SongStructuralType } from "../../data/songAnalysisTypes";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function meanInRange(profile: NumericProfile | undefined, startFrame: number, endFrame: number, totalFrames: number): number | undefined {
  if (!profile || totalFrames <= 0 || profile.sampleCount === 0) return undefined;
  const startIdx = Math.max(0, Math.floor((startFrame / totalFrames) * profile.sampleCount));
  const endIdx = Math.min(profile.sampleCount, Math.max(startIdx + 1, Math.floor((endFrame / totalFrames) * profile.sampleCount)));
  let sum = 0;
  let count = 0;
  for (let i = startIdx; i < endIdx; i++) { sum += profile.values[i]; count++; }
  return count > 0 ? sum / count : undefined;
}

export interface SuggestArrangementRolesInput {
  startFrame: number;
  endFrame: number;
  totalFrames: number;
  structuralType: SongStructuralType;
  energyProfile?: NumericProfile;
  densityProfile?: NumericProfile;
  percussiveProfile?: NumericProfile;
  brightnessProfile?: NumericProfile;
}

export function suggestArrangementRoles(input: SuggestArrangementRolesInput): SongRoleSuggestion {
  const energy = meanInRange(input.energyProfile, input.startFrame, input.endFrame, input.totalFrames) ?? 0.5;
  const density = meanInRange(input.densityProfile, input.startFrame, input.endFrame, input.totalFrames) ?? 0.5;
  const percussive = meanInRange(input.percussiveProfile, input.startFrame, input.endFrame, input.totalFrames) ?? 0.5;
  const brightness = meanInRange(input.brightnessProfile, input.startFrame, input.endFrame, input.totalFrames) ?? 0.5;

  const scored: Record<RadioArrangementRole, { confidence: number; reason: string }> = {
    foundation: {
      confidence: clamp01((1 - Math.abs(energy - 0.5)) * 0.5 + (1 - density) * 0.3 + (input.structuralType === "body" || input.structuralType === "intro" ? 0.2 : 0)),
      reason: `steady energy (${energy.toFixed(2)}), low density (${density.toFixed(2)})`,
    },
    motion: {
      confidence: clamp01(density * 0.5 + percussive * 0.5),
      reason: `density ${density.toFixed(2)}, percussive activity ${percussive.toFixed(2)}`,
    },
    detail: {
      confidence: clamp01(brightness * 0.6 + (1 - energy) * 0.4),
      reason: `brightness ${brightness.toFixed(2)}, lower energy (${energy.toFixed(2)})`,
    },
    event: {
      confidence: clamp01(energy * 0.5 + percussive * 0.5),
      reason: `high energy (${energy.toFixed(2)}) with percussive activity (${percussive.toFixed(2)})`,
    },
    bridge: {
      confidence: clamp01((input.structuralType === "bridge" || input.structuralType === "interlude" ? 0.6 : 0.1) + (1 - Math.abs(energy - 0.5)) * 0.2),
      reason: `structural type "${input.structuralType}"`,
    },
    recovery: {
      confidence: clamp01((1 - energy) * 0.6 + (1 - density) * 0.4),
      reason: `low energy (${energy.toFixed(2)}), low density (${density.toFixed(2)})`,
    },
  };

  return RADIO_ARRANGEMENT_ROLES
    .map((role) => ({ role, confidence: scored[role].confidence, reason: scored[role].reason }))
    .sort((a, b) => b.confidence - a.confidence);
}
