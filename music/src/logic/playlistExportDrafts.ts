// Playlist export copy builders (0705P)
// All functions are local/non-destructive — copy generation only.

import { buildTrackReadiness } from "./metadataReadiness";
import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { CrateRecord } from "../data/crateTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlaylistExportTrack = {
  index: number;
  title: string;
  artist: string;
  durationDisplay: string;
  startTimeDisplay: string;
  startTimeSeconds: number;
  bpm: number;
  key: string;
  energy: number | null;
  durationEstimated: boolean;
};

export type PlaylistExportContext = {
  playlistTitle: string;
  durationDisplay: string;
  durationSeconds: number;
  trackCount: number;
  tracks: PlaylistExportTrack[];
  crateNames: string[];
  bpmRange: string;
  keySummary: string;
  energyRange: string;
  warningCount: number;
  hasEstimatedDurations: boolean;
  playlistDescription: string;
  createdAt: string;
  updatedAt: string;
};

export type PlaylistExportOptions = {
  includeDurations: boolean;
  includeBpmKey: boolean;
  includeTimestamps: boolean;
  socialLength: "short" | "medium" | "broadcast";
};

export const defaultExportOptions: PlaylistExportOptions = {
  includeDurations: false,
  includeBpmKey: false,
  includeTimestamps: false,
  socialLength: "short",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  const sc = Math.floor(s % 60);
  return `${m}:${sc.toString().padStart(2, "0")}`;
}

function fmtHM(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTimestamp(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sc.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${sc.toString().padStart(2, "0")}`;
}

export function formatArtistTitle(track: PlaylistExportTrack): string {
  const { title, artist } = track;
  if (!artist || !artist.trim()) return title;
  // Avoid duplicating if title already contains the artist
  const titleLower = title.toLowerCase();
  const artistLower = artist.toLowerCase();
  if (titleLower.startsWith(artistLower) || titleLower.includes(` - ${artistLower}`)) return title;
  return `${artist} — ${title}`;
}

// ── Context builder ───────────────────────────────────────────────────────────

export function buildPlaylistExportContext(
  playlist: PlaylistRecord,
  acSlots: TrackSlot[],
  tracksById: Map<string, Track>,
  crates: CrateRecord[],
): PlaylistExportContext {
  const attached = crates.filter(c => playlist.crateIds?.includes(c.id));

  let cumulativeSec = 0;
  const tracks: PlaylistExportTrack[] = acSlots.map((slot, i) => {
    const t = tracksById.get(slot.assignedTrackId!);
    const readiness = t ? buildTrackReadiness(t) : null;
    const hasRealDur = readiness?.hasDuration ?? false;
    const dur = hasRealDur ? (t!.durationSeconds) : 0;
    const startSec = slot.startTimeSeconds > 0 ? slot.startTimeSeconds : cumulativeSec;
    cumulativeSec += dur;
    return {
      index: i + 1,
      title: t?.title ?? "(empty)",
      artist: t?.artist ?? "",
      durationDisplay: hasRealDur ? fmtDur(dur) : "—",
      startTimeDisplay: fmtTimestamp(startSec),
      startTimeSeconds: startSec,
      bpm: t?.bpm ?? 0,
      key: t?.camelotKey ?? "",
      energy: t?.energy ?? null,
      durationEstimated: !hasRealDur,
    };
  });

  const totalDur = acSlots.reduce((s, slot) => {
    const t = tracksById.get(slot.assignedTrackId!);
    const r = t ? buildTrackReadiness(t) : null;
    return s + (r?.hasDuration ? (t!.durationSeconds) : 0);
  }, 0);

  const bpms = tracks.map(t => t.bpm).filter(b => b > 0);
  const energies = tracks.map(t => t.energy).filter((e): e is number => e !== null);
  const keys = [...new Set(tracks.map(t => t.key).filter(Boolean))];
  const bpmMin = bpms.length ? Math.min(...bpms) : null;
  const bpmMax = bpms.length ? Math.max(...bpms) : null;
  const engMin = energies.length ? Math.min(...energies) : null;
  const engMax = energies.length ? Math.max(...energies) : null;

  return {
    playlistTitle: playlist.title,
    durationDisplay: fmtHM(totalDur),
    durationSeconds: totalDur,
    trackCount: tracks.length,
    tracks,
    crateNames: attached.map(c => c.name),
    bpmRange: bpmMin !== null && bpmMax !== null ? `${Math.round(bpmMin)}–${Math.round(bpmMax)}` : "—",
    keySummary: keys.slice(0, 4).join(", ") || "—",
    energyRange: engMin !== null && engMax !== null ? `${engMin.toFixed(1)}–${engMax.toFixed(1)}` : "—",
    warningCount: acSlots.filter(s => s.warningMessages.length > 0).length,
    hasEstimatedDurations: tracks.some(t => t.durationEstimated),
    playlistDescription: playlist.description ?? "",
    createdAt: playlist.createdAt ?? "",
    updatedAt: playlist.updatedAt ?? "",
  };
}

// ── Format functions ──────────────────────────────────────────────────────────

export function formatTracklistCopy(ctx: PlaylistExportContext, opts: PlaylistExportOptions): string {
  const header = [`${ctx.playlistTitle}`, `${ctx.trackCount} tracks · ${ctx.durationDisplay}`].join("\n");
  const lines = ctx.tracks.map(t => {
    const num = String(t.index).padStart(2, "0");
    const at = formatArtistTitle(t);
    const parts: string[] = [`${num}. ${at}`];
    if (opts.includeDurations && t.durationDisplay !== "—") parts.push(t.durationDisplay);
    if (opts.includeBpmKey) {
      const meta: string[] = [];
      if (t.bpm > 0) meta.push(`${Math.round(t.bpm)} BPM`);
      if (t.key) meta.push(t.key);
      if (meta.length) parts.push(meta.join(" · "));
    }
    return parts.length > 1 ? parts.join(" · ") : parts[0];
  });
  return [header, "", ...lines].join("\n");
}

export function formatYouTubeChapters(ctx: PlaylistExportContext): string {
  const lines = ctx.tracks.map(t => `${t.startTimeDisplay} ${formatArtistTitle(t)}`);
  return lines.join("\n");
}

export function formatYouTubeDescription(ctx: PlaylistExportContext, opts: PlaylistExportOptions): string {
  const parts: string[] = [];
  parts.push(ctx.playlistTitle);
  parts.push("");

  if (ctx.playlistDescription) {
    parts.push(ctx.playlistDescription);
    parts.push("");
  }

  parts.push("Tracklist:");
  for (const t of ctx.tracks) {
    const num = String(t.index).padStart(2, "0");
    const at = formatArtistTitle(t);
    const dur = opts.includeDurations && t.durationDisplay !== "—" ? ` · ${t.durationDisplay}` : "";
    parts.push(`${num}. ${at}${dur}`);
  }
  parts.push("");

  if (opts.includeTimestamps) {
    parts.push("Chapters:");
    parts.push(formatYouTubeChapters(ctx));
    parts.push("");
  }

  const details: string[] = [`${ctx.trackCount} tracks · ${ctx.durationDisplay}`];
  if (ctx.bpmRange !== "—") details.push(`BPM: ${ctx.bpmRange}`);
  if (ctx.keySummary !== "—") details.push(`Key: ${ctx.keySummary}`);
  parts.push("Playlist details:");
  parts.push(details.join("  ·  "));
  parts.push("");
  parts.push("Created with MUSIC / Wall of Sound.");

  return parts.join("\n");
}

export function formatSocialCaption(ctx: PlaylistExportContext, opts: PlaylistExportOptions): string {
  const crateTag = ctx.crateNames.length > 0 ? ` from ${ctx.crateNames.join(" / ")}` : "";
  const bpmTag = ctx.bpmRange !== "—" ? `, ${ctx.bpmRange} BPM` : "";
  const keyTag = ctx.keySummary !== "—" ? `, ${ctx.keySummary}` : "";

  if (opts.socialLength === "short") {
    return `${ctx.trackCount} tracks · ${ctx.durationDisplay}${bpmTag}${keyTag}. Built in MUSIC.`;
  }
  if (opts.socialLength === "medium") {
    return `A ${ctx.durationDisplay} playlist${crateTag}${bpmTag}${keyTag}.\n\n${ctx.trackCount} tracks. Built in MUSIC.`;
  }
  // broadcast
  return `Now playing:\n${ctx.playlistTitle}\n\n${ctx.trackCount} tracks · ${ctx.durationDisplay}${bpmTag}${keyTag}${crateTag ? `\nCrates: ${ctx.crateNames.join(", ")}` : ""}\n\nBuilt in MUSIC / Wall of Sound.`;
}

export function formatBroadcastCopy(ctx: PlaylistExportContext): string {
  const parts: string[] = [
    "Now playing:",
    ctx.playlistTitle,
    "",
    `${ctx.trackCount} tracks · ${ctx.durationDisplay}`,
  ];
  const meta: string[] = [];
  if (ctx.crateNames.length > 0) meta.push(ctx.crateNames.join(" · "));
  if (ctx.bpmRange !== "—") meta.push(`${ctx.bpmRange} BPM`);
  if (ctx.keySummary !== "—") meta.push(ctx.keySummary);
  if (meta.length) parts.push(meta.join(" · "));
  if (ctx.playlistDescription) {
    parts.push("");
    parts.push(ctx.playlistDescription);
  }
  return parts.join("\n");
}

export function formatExportForNotes(sectionName: string, content: string, date: string): string {
  return `\n\n## Export — ${sectionName} — ${date}\n${content}`;
}
