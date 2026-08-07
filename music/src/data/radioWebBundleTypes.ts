// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — the immutable,
// versioned, self-contained web-publication bundle contract (spec §Web
// bundle contract). A bundle is a LOCAL export a separate static
// website/player consumes as-is; nothing here uploads, deploys, or hosts
// anything. Pure — no DOM, no Node — importable from both the browser
// logic layer and the Node-only server layer.

import type { RadioValidationIssue } from "./radioLoopTypes";
import type { RadioTrackId, RadioTrackSectionSnapshot } from "./radioTrackPackageTypes";

export const RADIO_WEB_BUNDLE_SCHEMA_VERSION = "1.0.0";

// RADIO / DJ Mode Dock (0724B RADIO numbering; MUSIC build 0724C) — the
// only publicly authorized transition today. Deliberately a closed shape
// (not `TransitionFamily`/`TransitionStrategy` at large): a future family
// reaching active-mode authority in the in-app engine must NOT automatically
// become executable in the public listener — that requires its own,
// deliberate extension of this type plus real Sites-side execution support.
export interface RadioWebTransitionHint {
  family: "clean_cut";
  strategy: "clean_cut_hard_cut";
}

// One ordered enabled entry in radio-manifest.json. Every URL is a
// relative POSIX path inside the bundle — never absolute, never file://,
// never a MUSIC library path (enforced by writer AND validator).
export interface RadioWebManifestEntry {
  radioTrackId: RadioTrackId;
  packageVersion: number;
  audioUrl: string; // e.g. "audio/rtrack_000001-v1.opus"
  durationSeconds: number;
  byteSize: number;
  sha256: string;
  title: string;
  artist: string;
  bpm?: number;
  key?: string;
  moods?: string[];
  genres?: string[];
  // The transition INTO this entry from the previous one, if MUSIC's real
  // active-mode authority gate (djTransitionAuthorityGate.ts, via
  // radioWebTransitionHint.ts) approved one at publish time. Absent/null on
  // every entry today — no existing code path connects a RadioPlaylist's
  // entries back to a DjTransitionPlan's playlist-slot addressing (see
  // 0724C's completion report) — but the writer honors this field exactly
  // when a caller does supply one, and never fabricates it otherwise.
  transitionFromPrevious?: RadioWebTransitionHint | null;
}

// The static website entry point (radio-manifest.json).
export interface RadioWebManifest {
  schemaVersion: string;
  stationId: string; // RadioPlaylist.id — stable, never a transient id
  bundleVersion: number;
  title: string;
  artworkUrl?: string; // relative, e.g. "artwork/cover.png"
  entries: RadioWebManifestEntry[];
  totalDurationSeconds: number;
  totalByteSize: number;
  createdAt: string;
  // Optional performance assets (RadioLoop packages) live in a SEPARATE
  // field, never confused with baseline full-track audio. Empty in v1 —
  // documented future surface, no fake readiness.
  performanceAssets: unknown[];
}

// playlist.json — the ordered per-entry intelligence payload the player
// uses for playback logic and visuals (kept out of radio-manifest.json to
// keep the entry point lean).
export interface RadioWebPlaylistEntryDetail {
  radioTrackId: RadioTrackId;
  packageVersion: number;
  title: string;
  artist: string;
  durationSeconds: number;
  songIntelligence: {
    revision?: string;
    status?: string;
    sections: RadioTrackSectionSnapshot[];
  };
}

export interface RadioWebPlaylistFile {
  schemaVersion: string;
  stationId: string;
  bundleVersion: number;
  entries: RadioWebPlaylistEntryDetail[];
}

// checksums.json — per-file integrity + the semantic content signature
// used for unchanged-re-export detection (signature covers the ordered
// bindings and display/musical payloads, never timestamps or the bundle
// version itself).
export interface RadioWebChecksumsFile {
  schemaVersion: string;
  contentSignature: string;
  files: Record<string, { sha256: string; byteSize: number }>;
}

export interface RadioWebBundleValidationResult {
  ok: boolean;
  checkedAt: string;
  fileCount: number;
  issues: RadioValidationIssue[];
}

// ── Route request/response contracts ────────────────────────────────────

// The deterministic plan the browser sends to /radio-web-bundle-export.
// Deliberately ONLY exact bindings: every display/musical/section payload
// is read server-side from the bound immutable package manifests
// (hash-verified), never trusted from the client — same bindings in the
// same order always produce the same semantic bundle content.
export interface RadioWebBundleExportRequest {
  stationId: string;
  title: string;
  slug: string;
  entries: Array<{
    radioTrackId: RadioTrackId;
    packageVersion: number;
    // Optional, real DjTransitionPlan for the handoff INTO this entry from
    // the previous one, when a caller has one to offer (see
    // radioWebTransitionHint.ts). No existing caller supplies this today —
    // RadioPlaylist has no bridge back to a PlaylistRecord's slot-addressed
    // DjTransitionPlans (see 0724C's completion report) — but the writer
    // still validates it through the real active-mode authority gate before
    // it can ever appear in the exported manifest; unlike the rest of this
    // request, this is genuinely client-sourced (transition intelligence
    // has no server-side immutable source to re-derive it from), so it is
    // gated rather than re-derived.
    djTransitionPlan?: import("./djTransitionTypes").DjTransitionPlan;
    // The exact current-source context the client used when resolving the
    // plan back to a specific MUSIC slot adjacency. This is additive and
    // request-local only — never persisted. The server reuses the same
    // publish-time authority helper with this context rather than
    // inventing a second gate or approximating current source state from
    // package metadata alone.
    djTransitionContext?: {
      currentOutgoingTrackId: string | null;
      currentIncomingTrackId: string | null;
      currentOutgoingSourceFingerprint: string;
      currentIncomingSourceFingerprint: string;
      currentAnalysisRevisionKey: string;
      outgoingRegionsNow: import("../logic/djTransitionRegions").TransitionRegionCandidate[];
      incomingRegionsNow: import("../logic/djTransitionRegions").TransitionRegionCandidate[];
      activeStemSetLostCurrency: boolean;
      // Request-local canonical MUSIC preparation snapshots. These are
      // compared again by the shared lineage validator at publish time and
      // are never stored in the RADIO project or manifest.
      preparationLineageContext?: import("../logic/djTransitionPreparationLineage").TransitionPreparationLineageContext;
    };
  }>;
  djTransitionMode?: "off" | "shadow" | "active";
  // Data-URL artwork only (no network fetch exists server-side); omitted
  // when the playlist has none or it is URL-sourced.
  artworkDataUrl?: string;
  // Explicit user intent to create a new version even when the semantic
  // content matches the latest existing bundle version.
  force?: boolean;
}

export interface RadioWebBundleExportResponse {
  ok: boolean;
  unchanged?: boolean; // semantic match with existing version, not exported
  existingVersion?: number;
  bundleVersion?: number;
  slug?: string;
  exportPath?: string; // absolute local path, for Reveal/Copy-path only
  contentSignature?: string;
  totalByteSize?: number;
  totalDurationSeconds?: number;
  entryCount?: number;
  validation?: RadioWebBundleValidationResult;
  issues: RadioValidationIssue[];
}

// Persisted export history record (PlayProject.radioWebExports). Only a
// FULLY VALIDATED bundle ever produces one of these — an EXPORTED display
// state is derived from these records, never from playlist state alone.
export interface RadioWebExportRecord {
  id: string;
  radioPlaylistId: string;
  slug: string;
  bundleVersion: number;
  exportedAt: string;
  contentSignature: string;
  totalByteSize: number;
  totalDurationSeconds: number;
  entryCount: number;
  validation: { ok: true; checkedAt: string };
  exportPath: string;
}
