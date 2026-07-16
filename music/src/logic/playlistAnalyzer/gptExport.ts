// Playlist Analyzer Review — GPT-ready Markdown+YAML export (spec §8).

import type { PlaylistAnalyzerReview } from "../../data/playlistAnalyzerTypes";
import type { RepairExportInput } from "../playlistRepair/repairExport";
import { buildRepairSummaryYaml, buildRepairProse } from "../playlistRepair/repairExport";
import type { PlaylistRecord } from "../../data/playProjectTypes";

function yamlStr(s: string): string {
  // Minimal YAML-safe scalar quoting — good enough for titles/labels here.
  if (/[:#\-[\]{}"']/.test(s) || s.trim() !== s || s === "") return JSON.stringify(s);
  return s;
}

function yamlList(items: string[], indent = "  "): string {
  if (!items.length) return `${indent}[]`;
  return items.map((i) => `${indent}- ${yamlStr(i)}`).join("\n");
}

export function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export function buildGptExportFilename(review: PlaylistAnalyzerReview, todayMMDD: string): string {
  const safeTitle = review.playlistTitle.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_");
  return `${todayMMDD}_MUSIC_${safeTitle}_AnalyzerReview_v1.0.0.md`;
}

export function buildGptExportMarkdown(
  review: PlaylistAnalyzerReview,
  repair?: RepairExportInput,
  preparation?: PlaylistRecord["playbackPreparation"],
): string {
  const yaml: string[] = [];
  if (repair) {
    yaml.push(...buildRepairSummaryYaml(repair));
    yaml.push("");
  }
  // Playlist Transition Preparation (0714_MUSIC_Playlist_Transition_
  // Preparation §26) — UI and export derive from the same persisted
  // preparation record; never re-derived here.
  if (preparation) {
    yaml.push("playback_preparation:");
    yaml.push(`  readiness: ${preparation.readiness}`);
    yaml.push(`  prepared_at: ${preparation.preparedAt}`);
    yaml.push(`  ready_count: ${preparation.readyCount}`);
    yaml.push(`  fallback_count: ${preparation.fallbackCount}`);
    yaml.push(`  review_count: ${preparation.reviewCount}`);
    yaml.push(`  blocked_count: ${preparation.blockedCount}`);
    yaml.push("");
    yaml.push("transitions:");
    if (preparation.transitionPlans.length === 0) {
      yaml.push("  []");
    } else {
      for (const p of preparation.transitionPlans) {
        yaml.push(`  - from_position: ${p.fromPosition + 1}`);
        yaml.push(`    to_position: ${p.toPosition + 1}`);
        yaml.push(`    sync_mode: ${p.syncMode}`);
        yaml.push(`    outgoing_cue_seconds: ${p.outgoingCueSeconds}`);
        yaml.push(`    incoming_cue_seconds: ${p.incomingCueSeconds}`);
        yaml.push(`    transition_duration_seconds: ${p.transitionDurationSeconds}`);
        if (p.transitionBars != null) yaml.push(`    transition_bars: ${p.transitionBars}`);
        yaml.push(`    tempo_relationship: ${p.tempoRelationship}`);
        yaml.push(`    confidence: ${p.confidence}`);
        yaml.push(`    warnings: [${p.warnings.join(", ")}]`);
      }
    }
    yaml.push("");
  }
  yaml.push("playlist:");
  yaml.push(`  title: ${yamlStr(review.playlistTitle)}`);
  yaml.push(`  track_count: ${review.trackCount}`);
  yaml.push(`  duration_seconds: ${Math.round(review.totalDurationSeconds)}`);
  yaml.push("");
  yaml.push("coverage:");
  yaml.push(`  complete: ${review.coverage.completeCount}`);
  yaml.push(`  partial: ${review.coverage.partialCount}`);
  yaml.push(`  missing: ${review.coverage.missingCount}`);
  yaml.push(`  failed: ${review.coverage.failedCount}`);
  yaml.push(`  stale: ${review.coverage.staleCount}`);
  yaml.push("");
  yaml.push("identity:");
  yaml.push("  primary_moods:");
  yaml.push(yamlList(review.identity.primaryMoods));
  yaml.push("  secondary_moods:");
  yaml.push(yamlList(review.identity.secondaryMoods));
  if (review.identity.movement) yaml.push(`  movement: ${yamlStr(review.identity.movement)}`);
  if (review.identity.density) yaml.push(`  density: ${yamlStr(review.identity.density)}`);
  if (review.identity.emotionalTemperature) yaml.push(`  emotional_temperature: ${review.identity.emotionalTemperature}`);
  if (review.identity.resolution) yaml.push(`  resolution: ${yamlStr(review.identity.resolution)}`);
  yaml.push(`  confidence: ${review.identity.confidence}`);
  yaml.push("");
  yaml.push("arc:");
  for (const phase of review.arc.phases) {
    yaml.push(`  ${phase.phase}:`);
    yaml.push(`    character: ${yamlStr([phase.tonalCharacter, phase.texture, phase.energyMovement].filter(Boolean).join(", "))}`);
  }
  yaml.push("");
  yaml.push("tracks:");
  for (const t of review.tracks) {
    yaml.push(`  - position: ${t.position + 1}`);
    yaml.push(`    role: ${t.role}`);
    yaml.push(`    contribution: ${yamlStr(t.contribution)}`);
    // Track Beat Map Foundation (0713_MUSIC_Track_Beat_Map_Foundation §22)
    if (t.beatMapTrusted) {
      yaml.push(`    beat_map:`);
      yaml.push(`      status: trusted`);
      if (t.beatMapFirstBeatSeconds != null) yaml.push(`      first_beat_seconds: ${t.beatMapFirstBeatSeconds}`);
      if (t.beatMapFirstDownbeatSeconds != null) yaml.push(`      first_downbeat_seconds: ${t.beatMapFirstDownbeatSeconds}`);
      if (t.beatMapBarCount != null) yaml.push(`      bar_count: ${t.beatMapBarCount}`);
      if (t.beatMapTempoStable != null) yaml.push(`      tempo_stable: ${t.beatMapTempoStable}`);
      if (t.beatMapIntroCleanBars != null) yaml.push(`      intro_clean_bars: ${t.beatMapIntroCleanBars}`);
      if (t.beatMapOutroCleanBars != null) yaml.push(`      outro_clean_bars: ${t.beatMapOutroCleanBars}`);
      yaml.push(`      warnings: [${(t.beatMapWarningCodes ?? []).join(", ")}]`);
    }
    // Track Playback Bounds (0714_MUSIC_Track_Playback_Bounds §30)
    if (t.playbackBoundsTrusted) {
      yaml.push(`    playback_bounds:`);
      yaml.push(`      status: trusted`);
      if (t.playbackBoundsAudibleStartSeconds != null) yaml.push(`      audible_start_seconds: ${t.playbackBoundsAudibleStartSeconds}`);
      if (t.playbackBoundsPreferredStartSeconds != null) yaml.push(`      preferred_start_seconds: ${t.playbackBoundsPreferredStartSeconds}`);
      if (t.playbackBoundsPreferredEndSeconds != null) yaml.push(`      preferred_end_seconds: ${t.playbackBoundsPreferredEndSeconds}`);
      if (t.playbackBoundsAudibleEndSeconds != null) yaml.push(`      audible_end_seconds: ${t.playbackBoundsAudibleEndSeconds}`);
      if (t.playbackBoundsEffectiveDurationSeconds != null) yaml.push(`      effective_duration_seconds: ${t.playbackBoundsEffectiveDurationSeconds}`);
      if (t.playbackBoundsStartClassification) yaml.push(`      start_classification: ${t.playbackBoundsStartClassification}`);
      if (t.playbackBoundsEndClassification) yaml.push(`      end_classification: ${t.playbackBoundsEndClassification}`);
      yaml.push(`      warnings: [${(t.playbackBoundsWarningCodes ?? []).join(", ")}]`);
    }
  }
  yaml.push("");
  yaml.push("visual_translation:");
  yaml.push("  motion:");
  yaml.push(yamlList(review.creativeExport.motionDirection));
  yaml.push("  materials:");
  yaml.push(yamlList(review.creativeExport.materials));
  yaml.push("  color_character:");
  yaml.push(yamlList(review.creativeExport.colorCharacter));
  yaml.push("  avoid:");
  yaml.push(yamlList(review.creativeExport.avoid));

  const prose: string[] = [];
  prose.push(`# ${review.playlistTitle} — Playlist Analyzer Review`);
  prose.push("");
  prose.push(`${review.trackCount} tracks · ${fmtDuration(review.totalDurationSeconds)}`);
  prose.push("");
  prose.push("## Coverage");
  prose.push(`${review.coverage.completeCount} complete, ${review.coverage.partialCount} partial, ${review.coverage.missingCount} missing, ${review.coverage.failedCount} failed, ${review.coverage.staleCount} stale.`);
  prose.push("");
  prose.push("## Identity");
  prose.push(review.creativeExport.themeSummary);
  prose.push("");
  prose.push("## Arc");
  for (const phase of review.arc.phases) {
    prose.push(`**${phase.phase[0].toUpperCase()}${phase.phase.slice(1)}** — ${[phase.tonalCharacter, phase.energyMovement, phase.narrativeFunction].filter(Boolean).join("; ")}`);
  }
  prose.push("");
  if (repair) {
    prose.push(...buildRepairProse(repair));
    prose.push("");
  }
  prose.push("## Description Draft");
  prose.push(review.creativeExport.descriptionDraft);
  prose.push("");
  prose.push("## Visual Concept");
  prose.push(review.creativeExport.visualConcept);
  prose.push("");
  prose.push("## Image Prompt Draft");
  prose.push(review.creativeExport.imagePromptDraft);
  prose.push("");
  if (review.exceptions.length) {
    prose.push("## Exceptions");
    for (const ex of review.exceptions) {
      prose.push(`- **${ex.code}** (${ex.severity}): ${ex.explanation}`);
    }
    prose.push("");
  }
  prose.push("---");
  prose.push("_Measured values (BPM, key, duration, energy) are read directly from track analysis. Inferred values (mood, texture, role, transition type) are derived and carry a confidence score. Interpreted language (theme, visual concept, motion direction) is creative translation built from the above — not a measured fact._");

  return `---\n${yaml.join("\n")}\n---\n\n${prose.join("\n")}\n`;
}
