// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §6 — playlist-owned
// publication tracking, ported from the deleted RadioPublishView.tsx's
// dry-run preview/storage-estimate/per-entry-promote-dialog logic, now
// scoped to ONE radioPlaylist instead of a global `<select>`. Rendered as a
// modal from both the RADIO Playlist card and the multi-track prep
// workspace header (same panel, same modal).
//
// 0718B_RADIO_Web_Publication_Asset_Export_Bridge §Architecture decision 8
// — reworked from the old three-way alreadyPublished/needsPromotion/
// excluded split to the real five-category preview (Ready/Needs approval/
// Needs preparation/Stale-or-failed/Excluded) plus a separate, non-gating
// "Performance assets (optional)" section for already-published RadioLoop
// entries. The derived lifecycle line (Draft/Preparing/Ready to
// Export/Exported vN) is display-only — EXPORTED is only ever shown when
// a validated RadioWebExportRecord exists (never inferred from playlist
// state alone).
//
// HONEST LANGUAGE (mandatory): "Publish" copies real files into the Sites
// project's own LOCAL checkout (see below) — it must never claim this is a
// no-op or purely local-only action anymore. It must still never say
// "deploy", "go live", "push to production", or "Unpublish" — reaching the
// real public domain remains a separate, unautomated `git push` from
// inside that checkout (see docs/architecture/DEPLOYMENT.md), which this
// action never performs. Do not reintroduce the words "Publish to Web".
//
// Batch 0929-3 (lifecycle streamlining) — Publish is now the ONE operator
// action for the whole Playlist → Package chain. Internally it validates
// source audio, bulk-prepares/approves every eligible entry, exports an
// immutable Web Bundle version (RADIO-02's own already-existing,
// never-mutate-a-prior-version guarantee — see radioWebBundleWriter.ts),
// and — for a signed-in StudioRich operator — copies that version into the
// Sites checkout (RADIO-02's own /radio-publish-to-sites route, reused
// verbatim, never a second implementation). Per-track approval,
// preparation, the manual "Export Web Bundle…" dialog, and the editorial
// "Mark Ready for Publishing" flag are all real, still-supported
// operations — they live in the Diagnostics section below as advanced
// recovery, not as routine steps a successful Publish requires the
// operator to see or operate. "Create Program"/"Update Program" remain
// their own explicit decision (a Program is operator-facing production
// identity, never created or repointed as a side effect of Publish) and
// are the one next action surfaced once a version has actually reached
// the Sites checkout.
//
// RADIO-03 (batch 0929-5) — Program identity is stable, same discipline
// as RadioPlaylist's own identity (batch 0929-4): if a Program already
// references this station (any version), this panel offers "Update
// Program to vN" (preserves programId, and therefore every Channel
// rotation slot referencing it) instead of "Create Program" — a
// correction/republish never creates a second, redundant Program for the
// same playlist. See radioProgramLifecycle.ts for the pure decision logic
// and docs/architecture/radio/README.md for the full Program lifecycle.

import { useEffect, useRef, useState } from "react";
import {
  createFirebaseEventRadioRepository,
  createFirebaseMemberIdentityAuthority,
  generateRadioProgramId,
  STUDIO_RICH_OPERATOR_EMAILS,
  type MemberIdentityState,
  type RadioProgramSummary,
} from "@studiorich/member-identity";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { LoopAsset } from "../../data/loopTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist, RadioEntryPreparationState } from "../../data/radioPlaylistTypes";
import type { RadioWebExportRecord, RadioSitesPublicationRecord } from "../../data/radioWebBundleTypes";
import type { RadioPromotionFormInput } from "../../data/radioLoopTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { PromoteLoopToRadioResult, RadioPromotionPhase } from "../../logic/radio/radioPromotionOrchestrator";
import { buildPublishPreview } from "../../logic/radio/radioPublishPreview";
import { buildRadioPublicPackageBaseUrl } from "../../logic/radio/radioWebBundlePlan";
import { estimateInboxItemBytes, summarizePlaylistStorage } from "../../logic/radio/radioStorageEstimate";
import { computePublishPatch, computeUnpublishPatch, radioPlaylistStateLabel } from "../../logic/radio/radioPlaylistPublicationState";
import {
  runOnePublishViaFetch, PUBLISH_FAILURE_LABEL,
  type PublishStage, type PublishEntryFailure,
} from "../../logic/radio/radioOnePublishOrchestrator";
import { findProgramsForStation, planProgramLifecycleAction, findConflictingProgramForUpdate } from "../../logic/radio/radioProgramLifecycle";
import { PromoteToRadioDialog } from "./PromoteToRadioDialog";
import { RadioWebExportPreflightDialog } from "./RadioWebExportPreflightDialog";

// Batch 0929-3 — one combined stage sequence covering both the local
// export (PublishStage, from radioOnePublishOrchestrator.ts, reused
// verbatim) and the Sites-checkout copy that now follows it automatically.
type CombinedPublishStage = PublishStage | "publishing_to_sites";

const PUBLISH_STAGE_LABEL: Record<CombinedPublishStage, string> = {
  validating: "Validating audio",
  preparing: "Preparing audio",
  exporting: "Exporting web version",
  publishing_to_sites: "Publishing to Sites",
};

function nowIso(): string {
  return new Date().toISOString();
}

// RADIO-02 (batch 0929-2) — module-scope, same convention as
// generateRadioProgramId() (member-identity's own id generator): kept out
// of the component body so react-hooks/purity doesn't flag the inline
// Date.now()/Math.random() calls a handler needs for a fresh local id.
function generateSitesPublicationId(): string {
  return `sitespub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Batch 02I -- Published Package -> RADIO Program Creation: the SAME
// Firebase identity Event Radio Control already uses (same
// one-instance-per-app pattern every other consumer of this package
// follows) -- not a second sign-in flow. Firebase Auth's
// browserLocalPersistence means an operator who already signed in via
// Event Radio Control (event-control.html, same origin) is recognized
// here automatically; this panel never needs its own sign-in UI.
//
// Batch 02I-B -- LAZY on purpose: RadioPlaylistPublishPanel.tsx is reached
// via a fully static import chain from App.tsx, so a module-scope
// `createFirebaseMemberIdentityAuthority(...)` call would construct a real
// Firebase App/Auth instance on EVERY MUSIC session, whether or not the
// user ever opens a RADIO playlist. These two lazy getters defer that
// construction to the first actual use (this component mounting), while
// still only ever constructing one instance each for the lifetime of the
// page -- the same singleton behavior the eager version had, just
// deferred. Not a dynamic `import()` -- the module itself is still
// statically imported, per this batch's own scope note.
let cachedProgramCreationMemberIdentity: ReturnType<typeof createFirebaseMemberIdentityAuthority> | null = null;
function getProgramCreationMemberIdentity() {
  cachedProgramCreationMemberIdentity ??= createFirebaseMemberIdentityAuthority(import.meta.env);
  return cachedProgramCreationMemberIdentity;
}
let cachedProgramCreationRepository: ReturnType<typeof createFirebaseEventRadioRepository> | null = null;
function getProgramCreationRepository() {
  cachedProgramCreationRepository ??= createFirebaseEventRadioRepository(import.meta.env);
  return cachedProgramCreationRepository;
}
// Client-side UX gate ONLY, same convention as eventControlRuntime.ts's
// own OPERATOR_EMAILS and wall/'s subwayMapPaintSurface.js -- the real
// authority gate is firestore.rules' isEventOperator(), enforced
// regardless of what this list contains.
const PROGRAM_CREATION_OPERATOR_EMAILS = STUDIO_RICH_OPERATOR_EMAILS;

// RADIO-03 (batch 0929-5) — covers both outcomes now possible: creating a
// Program (first time this station has one) or updating an existing
// Program's Package reference (adopting a corrected/new version).
type ProgramLifecycleState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; programId: string; action: "created" | "updated" }
  | { status: "error"; message: string };

// RADIO-02 (batch 0929-2) — the "Publish to Sites" action's own state.
// "idle" also covers "already published, ready to republish" — whether a
// version has already reached the Sites checkout is derived from
// radioSitesPublications, not tracked here (see sitesPublicationForLatestExport).
type SitesPublishState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

interface Props {
  radioPlaylist: RadioPlaylist;
  allRadioPlaylists: RadioPlaylist[];
  radioInboxItems: RadioInboxItem[];
  libraryTracks: Track[];
  songAnalyses: CompleteSongAnalysis[];
  sourceMusicPlaylists: PlaylistRecord[];
  loops: LoopAsset[];
  preparationStateByEntryId: Map<string, RadioEntryPreparationState>;
  radioWebExports: RadioWebExportRecord[];
  radioSitesPublications: RadioSitesPublicationRecord[];
  onUpdateRadioPlaylist: (id: string, patch: Partial<RadioPlaylist>) => void;
  onUpdateRadioInboxItem: (id: string, patch: Partial<RadioInboxItem>) => void;
  onPromoteToRadio: (loopId: string, formInput: RadioPromotionFormInput, onProgress?: (phase: RadioPromotionPhase) => void) => Promise<PromoteLoopToRadioResult>;
  onExportedWebBundle: (record: RadioWebExportRecord) => void;
  onPublishedToSites: (record: RadioSitesPublicationRecord) => void;
  onClose: () => void;
}

// Derived, display-only lifecycle — never rewrites the persisted
// RadioPlaylistState enum. EXPORTED vN only ever renders when a validated
// RadioWebExportRecord actually exists for this playlist.
function derivedLifecycleLabel(preview: ReturnType<typeof buildPublishPreview>, latestExport: RadioWebExportRecord | undefined, hasPreparing: boolean): string {
  if (latestExport) return `Exported v${latestExport.bundleVersion}`;
  if (hasPreparing) return "Preparing";
  const total = preview.ready.length + preview.needsApproval.length + preview.needsPreparation.length + preview.staleOrFailed.length;
  if (total > 0 && preview.ready.length === total) return "Ready to Export";
  return "Draft";
}

export function RadioPlaylistPublishPanel({
  radioPlaylist, allRadioPlaylists, radioInboxItems, libraryTracks, songAnalyses, loops,
  sourceMusicPlaylists,
  preparationStateByEntryId, radioWebExports, radioSitesPublications,
  onUpdateRadioPlaylist, onUpdateRadioInboxItem, onPromoteToRadio, onExportedWebBundle, onPublishedToSites, onClose,
}: Props) {
  const [promotingLoop, setPromotingLoop] = useState<LoopAsset | null>(null);
  const [confirmingMark, setConfirmingMark] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // 0723_RADIO_One_Action_Publish, extended by batch 0929-3 — the single
  // Publish action's own state, now spanning both stages (export, then
  // Sites-copy) behind one button/one progress indicator.
  const [publishStage, setPublishStage] = useState<CombinedPublishStage | null>(null);
  const [publishFailures, setPublishFailures] = useState<PublishEntryFailure[]>([]);

  // RADIO-02 (batch 0929-2), still used by the manual Diagnostics recovery
  // control (batch 0929-3) for the case where Publish's own automatic
  // Sites-copy stage specifically needs a retry without re-running export.
  const [sitesPublish, setSitesPublish] = useState<SitesPublishState>({ status: "idle" });

  // Batch 02I, broadened by RADIO-03 (batch 0929-5) — Create/Update
  // Program action's own state, independent of Publish.
  const [programLifecycle, setProgramLifecycle] = useState<ProgramLifecycleState>({ status: "idle" });
  // RADIO-03 — every real Program already referencing this station
  // (public read, no operator sign-in required just to look). null means
  // "not loaded yet" — distinct from an empty array, so the UI never
  // flashes "Create Program" before this resolves.
  const [existingProgramsForStation, setExistingProgramsForStation] = useState<readonly RadioProgramSummary[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getProgramCreationRepository()
      .listRadioPrograms()
      .then((programs) => { if (!cancelled) setExistingProgramsForStation(findProgramsForStation(programs, radioPlaylist.id)); })
      .catch(() => { if (!cancelled) setExistingProgramsForStation([]); });
    return () => { cancelled = true; };
  }, [radioPlaylist.id]);
  const [memberState, setMemberState] = useState<MemberIdentityState>(() => getProgramCreationMemberIdentity().getState());
  useEffect(() => {
    const memberIdentity = getProgramCreationMemberIdentity();
    const unsubscribe = memberIdentity.subscribe(setMemberState);
    void memberIdentity.start();
    return unsubscribe;
  }, []);
  const isAuthorizedOperator =
    memberState.status === "signedIn" && PROGRAM_CREATION_OPERATOR_EMAILS.includes(memberState.authUser.email ?? "");

  // Same pattern as RadioMultiTrackPrepWorkspace's radioPlaylistRef —
  // onEntryPatch fires repeatedly across awaited network calls within one
  // Publish run; reading the closed-over `radioPlaylist` prop directly
  // there would silently stomp an earlier entry's patch with a stale
  // entries array once React re-renders between them.
  const radioPlaylistRef = useRef(radioPlaylist);
  useEffect(() => { radioPlaylistRef.current = radioPlaylist; }, [radioPlaylist]);

  const preview = buildPublishPreview(radioPlaylist, radioInboxItems, preparationStateByEntryId);
  const entries = radioPlaylist.entries.slice().sort((a, b) => a.order - b.order);
  const entryTrack = new Map<string, Track | undefined>(
    entries.map((e) => {
      const item = radioInboxItems.find((i) => i.id === e.inboxItemId);
      return [e.id, item?.sourceTrackId ? libraryTracks.find((t) => t.trackId === item.sourceTrackId) : undefined];
    }),
  );

  const playlistExports = radioWebExports
    .filter((r) => r.radioPlaylistId === radioPlaylist.id)
    .slice()
    .sort((a, b) => b.bundleVersion - a.bundleVersion);
  const latestExport = playlistExports[0];
  const hasPreparing = entries.some((e) => preparationStateByEntryId.get(e.id) === "PREPARING");

  const playlistSitesPublications = radioSitesPublications
    .filter((r) => r.radioPlaylistId === radioPlaylist.id)
    .slice()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // RADIO-02 (batch 0929-2) — whether latestExport has actually reached the
  // Sites checkout, derived ONLY from a real recorded success (never from
  // latestExport/playlist state alone — same discipline as latestExport's
  // own derivation above). Gates Create Program below: creating a Program
  // whose manifestBaseUrl points at a package that was never actually
  // copied to the Sites checkout would be a dead link.
  const sitesPublicationForLatestExport = latestExport
    ? radioSitesPublications
        .filter((r) => r.radioPlaylistId === radioPlaylist.id && r.slug === latestExport.slug && r.bundleVersion === latestExport.bundleVersion)
        .slice()
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0]
    : undefined;

  // RADIO-03 (batch 0929-5) — what the operator should be offered for
  // Program lifecycle: create (no Program yet), update (one exists, behind
  // the latest version), up to date (one exists, already current), or
  // ambiguous (more than one already references this station — resolved
  // in Diagnostics, never silently picked for the operator). null only
  // while existingProgramsForStation hasn't loaded yet.
  const programPlan =
    existingProgramsForStation && latestExport
      ? planProgramLifecycleAction(existingProgramsForStation, latestExport.bundleVersion)
      : null;

  // RADIO-02's own /radio-publish-to-sites request, extracted so it can be
  // called two ways: automatically, as Publish's own internal final stage
  // below; and manually, from the Diagnostics recovery control, for the
  // narrow case where THAT stage specifically failed/needs a retry without
  // re-running the whole export. Never a second implementation of the copy
  // itself — same route, same server-side logic either way.
  async function publishExportToSites(exportRecord: RadioWebExportRecord): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const response = await fetch("/radio-publish-to-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: exportRecord.slug, bundleVersion: exportRecord.bundleVersion }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        return { ok: false, message: body?.error ?? `Publish to Sites failed (HTTP ${response.status})` };
      }
      onPublishedToSites({
        id: generateSitesPublicationId(),
        radioPlaylistId: radioPlaylist.id,
        slug: exportRecord.slug,
        bundleVersion: exportRecord.bundleVersion,
        publishedAt: nowIso(),
        relativeFinalDir: body.relativeFinalDir,
        manifestUrl: body.manifestUrl ?? null,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  // Batch 0929-3 (lifecycle streamlining) — the ONE operator Publish
  // action. Internally: validate/prepare/bulk-approve/export (unchanged,
  // radioOnePublishOrchestrator.ts), then — for a signed-in operator only,
  // preserving RADIO-02's exact same authorization boundary — copy the
  // resulting (or already-current, if this run was a no-op re-export) real
  // version into the Sites checkout. A non-operator's Publish still
  // exports the immutable local Package correctly; it just stops there,
  // with an explicit reason, never a silent partial success.
  async function handlePublish() {
    setPublishFailures([]);
    setSitesPublish({ status: "idle" });
    setPublishStage("validating");
    try {
      const result = await runOnePublishViaFetch(
        {
          playlist: radioPlaylistRef.current,
          inboxItems: radioInboxItems,
          tracks: libraryTracks,
          analyses: songAnalyses,
          sourceMusicPlaylists,
          allPlaylists: allRadioPlaylists,
        },
        {
          onProgress: (stage) => setPublishStage(stage),
          onEntryPatch: (entryId, patch) => {
            const nextEntries = radioPlaylistRef.current.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e));
            radioPlaylistRef.current = { ...radioPlaylistRef.current, entries: nextEntries };
            onUpdateRadioPlaylist(radioPlaylistRef.current.id, { entries: nextEntries });
          },
        },
      );
      if (result.exportRecord) onExportedWebBundle(result.exportRecord);
      if (result.playlistPatch) onUpdateRadioPlaylist(radioPlaylistRef.current.id, result.playlistPatch);
      setPublishFailures(result.failures);

      const effectiveExport = result.exportRecord ?? latestExport;
      if (result.ok && effectiveExport && isAuthorizedOperator) {
        setPublishStage("publishing_to_sites");
        const sitesResult = await publishExportToSites(effectiveExport);
        if (!sitesResult.ok) setSitesPublish({ status: "error", message: sitesResult.message });
      }
    } finally {
      setPublishStage(null);
    }
  }

  // Diagnostics-only manual recovery — retries ONLY the Sites-copy stage
  // against the current latestExport, without re-running export/approval.
  async function handleRetryPublishToSites() {
    if (!latestExport || sitesPublish.status === "pending") return;
    setSitesPublish({ status: "pending" });
    const result = await publishExportToSites(latestExport);
    setSitesPublish(result.ok ? { status: "idle" } : { status: "error", message: result.message });
  }

  // Batch 02I — constructs the create input ONLY from already-authoritative
  // publication data already in scope (radioPlaylist, latestExport) — no
  // extra fetch, no re-derivation of the track list, no package identity
  // inferred from title/slug. Never touches eventProgram/current — creating
  // a Program never puts it on air.
  //
  // Batch 02V — manifestBaseUrl now points at the PUBLISHED package's
  // public address (buildRadioPublicPackageBaseUrl), not MUSIC's own
  // /radio-web-export dev-server preview route. A Program is operator-
  // facing production identity; it must be consumable by a listener who
  // isn't running MUSIC's dev server at all. The dev-only preview route
  // remains untouched below (see the "Preview" link), and is deliberately
  // never used for Program creation.
  async function handleCreateProgram() {
    if (!latestExport || programLifecycle.status === "pending") return;
    setProgramLifecycle({ status: "pending" });
    try {
      const manifestBaseUrl = buildRadioPublicPackageBaseUrl({ slug: latestExport.slug, bundleVersion: latestExport.bundleVersion });
      const created = await getProgramCreationRepository().createRadioProgram({
        programId: generateRadioProgramId(),
        title: radioPlaylist.title,
        manifestBaseUrl,
        trackCount: latestExport.entryCount,
        totalDurationSeconds: latestExport.totalDurationSeconds,
        stationId: radioPlaylist.id,
        bundleVersion: latestExport.bundleVersion,
      });
      setProgramLifecycle({ status: "success", programId: created.id, action: "created" });
      setExistingProgramsForStation((prev) => [...(prev ?? []), created]);
    } catch (error) {
      setProgramLifecycle({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  // RADIO-03 (batch 0929-5) -- the corrective counterpart to
  // handleCreateProgram: adopts a corrected/new Package version onto an
  // EXISTING Program, preserving its programId (so every Channel rotation
  // slot or eventProgram/current reference to it keeps working unchanged
  // -- see docs/architecture/radio/README.md). Same
  // Sites-publication/operator gates as create; never mutates Package v1
  // or any other already-published version, only which one this Program's
  // own reference points at.
  async function handleUpdateProgram(program: RadioProgramSummary) {
    if (!latestExport || programLifecycle.status === "pending") return;
    const conflict = findConflictingProgramForUpdate(existingProgramsForStation ?? [], program.id, radioPlaylist.id, latestExport.bundleVersion);
    if (conflict) {
      setProgramLifecycle({ status: "error", message: `Program "${conflict.title}" (${conflict.id}) already references v${latestExport.bundleVersion} — resolve that first.` });
      return;
    }
    setProgramLifecycle({ status: "pending" });
    try {
      const manifestBaseUrl = buildRadioPublicPackageBaseUrl({ slug: latestExport.slug, bundleVersion: latestExport.bundleVersion });
      const updated = await getProgramCreationRepository().updateRadioProgram({
        programId: program.id,
        title: radioPlaylist.title,
        manifestBaseUrl,
        trackCount: latestExport.entryCount,
        totalDurationSeconds: latestExport.totalDurationSeconds,
        stationId: radioPlaylist.id,
        bundleVersion: latestExport.bundleVersion,
      });
      setProgramLifecycle({ status: "success", programId: updated.id, action: "updated" });
      setExistingProgramsForStation((prev) => (prev ?? []).map((p) => (p.id === updated.id ? updated : p)));
    } catch (error) {
      setProgramLifecycle({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const storageSummary = summarizePlaylistStorage(
    [...preview.ready, ...preview.needsApproval, ...preview.needsPreparation, ...preview.staleOrFailed].map((e) => {
      const item = radioInboxItems.find((i) => i.id === e.inboxItemId);
      const track = item?.sourceTrackId ? libraryTracks.find((t) => t.trackId === item.sourceTrackId) : undefined;
      const bytes = item ? estimateInboxItemBytes(item.kind, track?.durationSeconds) : "unknown";
      return { entryId: e.entryId, bytes };
    }),
    radioPlaylist.storageBudgetBytes,
  );

  function itemFor(entryId: string): RadioInboxItem | undefined {
    const entry = radioPlaylist.entries.find((e) => e.id === entryId);
    return entry ? radioInboxItems.find((i) => i.id === entry.inboxItemId) : undefined;
  }

  function trackLabelFor(entryId: string): string {
    const item = itemFor(entryId);
    if (!item?.sourceTrackId) return entryId;
    const track = libraryTracks.find((t) => t.trackId === item.sourceTrackId);
    return track ? `${track.artist} — ${track.title}` : item.sourceTrackId;
  }

  function handlePromoteClick(entryId: string) {
    const item = itemFor(entryId);
    if (!item?.sourceLoopId) return;
    const loop = loops.find((l) => l.id === item.sourceLoopId);
    if (loop) setPromotingLoop(loop);
  }

  function handlePromotionComplete(item: RadioInboxItem | undefined, result: PromoteLoopToRadioResult) {
    if (item && result.ok && result.radioLoopId) {
      onUpdateRadioInboxItem(item.id, { legacyRadioLoopId: result.radioLoopId, state: "PUBLISHED" });
    }
  }

  function handleConfirmMarkReady() {
    const now = nowIso();
    const { targetPatch, othersToUnpublish } = computePublishPatch(radioPlaylist, allRadioPlaylists, now);
    onUpdateRadioPlaylist(radioPlaylist.id, targetPatch);
    for (const other of othersToUnpublish) onUpdateRadioPlaylist(other.id, other.patch);
    setConfirmingMark(false);
  }

  function handleRemoveMark() {
    onUpdateRadioPlaylist(radioPlaylist.id, computeUnpublishPatch(radioPlaylist, nowIso()));
  }

  const isMarkedReady = radioPlaylist.state === "PUBLISHED";
  const hasPriorMark = !!radioPlaylist.publishedAt;
  const eligibleForMark = preview.ready.length + preview.performanceAssets.length;

  function renderCategory(title: string, items: typeof preview.ready, opts?: { showLoopPromote?: boolean }) {
    return (
      <div className="radio-publish-section">
        <h3>{title} ({items.length})</h3>
        <ul>
          {items.map((e) => {
            const item = itemFor(e.entryId);
            const canPromote = opts?.showLoopPromote && item?.kind === "loop" && !item.legacyRadioLoopId && item.sourceLoopId;
            return (
              <li key={e.entryId}>
                {trackLabelFor(e.entryId)}
                {e.reason && <span className="radio-diff-note"> — {e.reason}</span>}
                {canPromote && <button onClick={() => handlePromoteClick(e.entryId)}>Promote…</button>}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="radio-dialog-overlay" role="dialog" aria-modal="true">
      <div className="radio-dialog radio-publish-panel">
        <div className="radio-dialog-header-row">
          <h3>{radioPlaylist.title} — Publication Tracking</h3>
          <button className="radio-overlay-close" onClick={onClose}>✕</button>
        </div>

        <p className="radio-publish-notice">
          Publish validates, prepares, and exports this playlist as an immutable Package version, then copies it
          into the Sites project's own checkout. It never commits, pushes, or deploys — reaching the public
          domain is a separate, unautomated step.
        </p>

        <div className="radio-publish-primary">
          {publishStage ? (
            <>
              <button className="npw-btn npw-btn--primary" disabled>Publishing…</button>
              <span className="radio-diff-note">{PUBLISH_STAGE_LABEL[publishStage]}</span>
            </>
          ) : latestExport && sitesPublicationForLatestExport ? (
            <>
              <a className="npw-btn npw-btn--primary" href={`/radio-player.html?slug=${encodeURIComponent(latestExport.slug)}&v=${latestExport.bundleVersion}`} target="_blank" rel="noreferrer">
                Play Preview
              </a>
              {programLifecycle.status === "success" ? (
                <span className="radio-diff-note">
                  Program {programLifecycle.action === "created" ? "created" : "updated"}: {programLifecycle.programId}. Not on air yet — reload Channel Control/Event Radio Control to see it (the program catalog loads once per sign-in, not live).
                </span>
              ) : !isAuthorizedOperator ? (
                <span className="radio-diff-note">
                  Sign in as the StudioRich operator (via Event Radio Control) to {programPlan?.kind === "update_available" ? "update the Program for" : "create a Program from"} this package.
                </span>
              ) : programPlan === null ? (
                <span className="radio-diff-note">Checking existing Programs…</span>
              ) : programPlan.kind === "up_to_date" ? (
                <span className="radio-diff-note">Program "{programPlan.program.title}" is already on this version ({programPlan.program.id}).</span>
              ) : programPlan.kind === "update_available" ? (
                <>
                  <button className="npw-btn npw-btn--primary" onClick={() => handleUpdateProgram(programPlan.program)} disabled={programLifecycle.status === "pending"}>
                    {programLifecycle.status === "pending" ? "Updating Program…" : `Update Program to v${latestExport.bundleVersion}`}
                  </button>
                  {programLifecycle.status === "error" && <span className="radio-diff-note">{programLifecycle.message}</span>}
                </>
              ) : programPlan.kind === "ambiguous" ? (
                <span className="radio-diff-note">Multiple Programs already reference this playlist ({programPlan.programs.length}) — resolve in Diagnostics.</span>
              ) : (
                <>
                  <button className="npw-btn npw-btn--primary" onClick={handleCreateProgram} disabled={programLifecycle.status === "pending"}>
                    {programLifecycle.status === "pending" ? "Creating Program…" : "Create Program"}
                  </button>
                  {programLifecycle.status === "error" && <span className="radio-diff-note">{programLifecycle.message}</span>}
                </>
              )}
              <button className="npw-btn npw-btn--ghost" onClick={handlePublish}>Publish New Version</button>
            </>
          ) : latestExport ? (
            <>
              <a className="npw-btn npw-btn--ghost" href={`/radio-player.html?slug=${encodeURIComponent(latestExport.slug)}&v=${latestExport.bundleVersion}`} target="_blank" rel="noreferrer">
                Play Preview
              </a>
              <span className="radio-diff-note">
                Exported v{latestExport.bundleVersion} locally.{" "}
                {isAuthorizedOperator
                  ? "Publish to finish copying it to the Sites project."
                  : "Sign in as the StudioRich operator (via Event Radio Control) to publish it to the Sites project."}
              </span>
              <button className="npw-btn npw-btn--primary" onClick={handlePublish}>Publish</button>
            </>
          ) : (
            <button className="npw-btn npw-btn--primary" onClick={handlePublish}>Publish</button>
          )}
        </div>

        {sitesPublish.status === "error" && (
          <div className="radio-publish-failures">
            <h4>Publish exported locally, but couldn't reach the Sites project</h4>
            <p className="radio-diff-note">{sitesPublish.message}</p>
            <button className="npw-btn npw-btn--primary" onClick={handlePublish}>Retry Publish</button>
          </div>
        )}

        {publishFailures.length > 0 && (
          <div className="radio-publish-failures">
            <h4>Publish couldn't complete ({publishFailures.length})</h4>
            <ul>
              {publishFailures.map((f, i) => (
                <li key={i}>{f.title && f.entryId ? `"${f.title}" — ` : ""}{PUBLISH_FAILURE_LABEL[f.category]}{f.message ? ` — ${f.message}` : ""}</li>
              ))}
            </ul>
            <button className="npw-btn npw-btn--primary" onClick={handlePublish}>Retry Publish</button>
          </div>
        )}

        <details className="radio-publish-preview">
          <summary>Diagnostics — per-track approval/preparation, manual export, and Sites-publish recovery</summary>

          <p className="radio-diff-note">
            Current state: <strong>{radioPlaylistStateLabel(radioPlaylist.state)}</strong>
            {" · "}Web bundle lifecycle: <strong>{derivedLifecycleLabel(preview, latestExport, hasPreparing)}</strong>
          </p>

          {programPlan?.kind === "ambiguous" && latestExport && (
            <div className="radio-publish-section radio-publish-program-ambiguous">
              <h3>Programs referencing this playlist ({programPlan.programs.length})</h3>
              <p className="radio-diff-note">
                More than one Program already references this playlist — pick which one should adopt v{latestExport.bundleVersion}.
              </p>
              <ul>
                {programPlan.programs.map((p) => (
                  <li key={p.id}>
                    {p.title} ({p.id}) — currently v{p.bundleVersion ?? "?"}
                    {isAuthorizedOperator && p.bundleVersion !== latestExport.bundleVersion && (
                      <button
                        className="npw-btn npw-btn--ghost"
                        onClick={() => handleUpdateProgram(p)}
                        disabled={programLifecycle.status === "pending"}
                      >
                        {programLifecycle.status === "pending" ? "Updating…" : `Update to v${latestExport.bundleVersion}`}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {programLifecycle.status === "error" && <p className="radio-diff-note">{programLifecycle.message}</p>}
            </div>
          )}

          <div className="radio-publish-storage">
            <span>Estimated size: {(storageSummary.totalBytes / 1024 / 1024).toFixed(1)} MB</span>
            <span>Budget: {(storageSummary.budgetBytes / 1024 / 1024 / 1024).toFixed(1)} GB</span>
            <span>Remaining: {(storageSummary.remainingBytes / 1024 / 1024).toFixed(1)} MB</span>
            {storageSummary.unknownCount > 0 && <span>{storageSummary.unknownCount} unknown-size assets</span>}
            {storageSummary.overBudget && <span className="radio-badge radio-badge-failed">Over budget</span>}
            {storageSummary.nearBudget && !storageSummary.overBudget && <span className="radio-badge radio-badge-unprepared">Near budget</span>}
          </div>

          {renderCategory("Ready", preview.ready)}
          {renderCategory("Needs approval", preview.needsApproval)}
          {renderCategory("Needs preparation", preview.needsPreparation)}
          {renderCategory("Stale / failed", preview.staleOrFailed)}
          {renderCategory("Excluded", preview.excluded, { showLoopPromote: true })}

          <div className="radio-publish-section radio-publish-performance-assets">
            <h3>Performance assets — optional ({preview.performanceAssets.length})</h3>
            <p className="radio-diff-note">RadioLoop performance clips never gate a full-track Web Bundle export.</p>
            <ul>
              {preview.performanceAssets.map((e) => <li key={e.entryId}>{trackLabelFor(e.entryId)} · {e.radioLoopId}</li>)}
            </ul>
          </div>

          {playlistExports.length > 0 && (
            <div className="radio-publish-section radio-publish-export-history">
              <h3>Exported bundles ({playlistExports.length})</h3>
              <ul>
                {playlistExports.map((r) => (
                  <li key={r.id}>
                    v{r.bundleVersion} — {r.entryCount} tracks — {(r.totalByteSize / 1024 / 1024).toFixed(1)} MB — {new Date(r.exportedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {playlistSitesPublications.length > 0 && (
            <div className="radio-publish-section radio-publish-sites-history">
              <h3>Published to Sites ({playlistSitesPublications.length})</h3>
              <ul>
                {playlistSitesPublications.map((r) => (
                  <li key={r.id}>
                    v{r.bundleVersion} — {r.relativeFinalDir} — {new Date(r.publishedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="radio-dialog-actions">
            {latestExport && isAuthorizedOperator && (
              <button className="npw-btn npw-btn--ghost" onClick={handleRetryPublishToSites} disabled={sitesPublish.status === "pending"}>
                {sitesPublish.status === "pending" ? "Republishing to Sites…" : `Republish v${latestExport.bundleVersion} to Sites`}
              </button>
            )}
            <button className="npw-btn npw-btn--primary" onClick={() => setShowExportDialog(true)}>Export Web Bundle…</button>
            {isMarkedReady ? (
              <button className="npw-btn npw-btn--ghost" onClick={handleRemoveMark}>Remove Publication Mark</button>
            ) : !confirmingMark ? (
              <button
                className="npw-btn npw-btn--ghost"
                disabled={eligibleForMark === 0}
                onClick={() => setConfirmingMark(true)}
              >
                {hasPriorMark ? "Update Publication Mark" : "Mark Ready for Publishing"}
              </button>
            ) : (
              <>
                <span>Mark {eligibleForMark} entries ready? Excluded entries are skipped.</span>
                <button className="npw-btn npw-btn--ghost" onClick={() => setConfirmingMark(false)}>Cancel</button>
                <button className="npw-btn npw-btn--primary" onClick={handleConfirmMarkReady}>Confirm</button>
              </>
            )}
          </div>
        </details>

        {showExportDialog && (
        <RadioWebExportPreflightDialog
          radioPlaylist={radioPlaylist}
          entries={entries}
          entryTrack={entryTrack}
          preparationStateByEntryId={preparationStateByEntryId}
          sourceMusicPlaylists={sourceMusicPlaylists}
          libraryTracks={libraryTracks}
          songAnalyses={songAnalyses}
          radioWebExports={radioWebExports}
          onExported={(record) => { onExportedWebBundle(record); }}
          onClose={() => setShowExportDialog(false)}
          />
        )}

        {promotingLoop && (
          <PromoteToRadioDialog
            loop={promotingLoop}
            onPromote={async (loopId, formInput, onProgress) => {
              const result = await onPromoteToRadio(loopId, formInput, onProgress);
              const item = radioInboxItems.find((i) => i.sourceLoopId === loopId);
              handlePromotionComplete(item, result);
              return result;
            }}
            onClose={() => setPromotingLoop(null)}
          />
        )}
      </div>
    </div>
  );
}
