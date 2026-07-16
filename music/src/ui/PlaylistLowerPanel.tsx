import { useState, useCallback } from "react";
import type React from "react";
import type { TrackSlot, TrackLock } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";
import type { PlaylistRecord, PlaylistPathOption } from "../data/playProjectTypes";
import type { CrateRecord } from "../data/crateTypes";
import type { TrackEligibilityContext } from "../logic/trackEligibility";
import { PlaylistFlowChart } from "./PlaylistFlowChart";
import {
  type PlaylistAssistantContext,
  type PlaylistAssistantDraft,
  buildSmoothTransitionsDraft,
  buildExtendDurationDraft,
  buildReplaceWarningsDraft,
  buildBetterOpenerDraft,
  buildBetterCloserDraft,
  buildDescriptionDraft,
  buildAlternateVersionDraft,
  buildExportCopyDraft,
  buildCustomPromptDraft,
  formatDraftForClipboard,
  formatDraftForNotes,
} from "../logic/playlistAssistantDrafts";
import {
  type PlaylistExportOptions,
  defaultExportOptions,
  buildPlaylistExportContext,
  formatTracklistCopy,
  formatYouTubeDescription,
  formatYouTubeChapters,
  formatSocialCaption,
  formatBroadcastCopy,
  formatExportForNotes,
} from "../logic/playlistExportDrafts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtHM(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function buildCtx(
  playlist: PlaylistRecord,
  acSlots: TrackSlot[],
  tracksById: Map<string, Track>,
  crates: CrateRecord[],
  candidateCount: number,
): PlaylistAssistantContext {
  const totalDur = acSlots.reduce((s, slot) => s + (tracksById.get(slot.assignedTrackId!)?.durationSeconds ?? 0), 0);
  const attached = crates.filter((c) => playlist.crateIds?.includes(c.id));
  const bpms = acSlots.map(s => tracksById.get(s.assignedTrackId!)?.bpm).filter((b): b is number => typeof b === "number" && b > 0);
  const energies = acSlots.map(s => tracksById.get(s.assignedTrackId!)?.energy).filter((e): e is number => typeof e === "number");
  const keys = [...new Set(acSlots.map(s => tracksById.get(s.assignedTrackId!)?.camelotKey).filter(Boolean))];
  const bpmMin = bpms.length ? Math.min(...bpms) : null;
  const bpmMax = bpms.length ? Math.max(...bpms) : null;
  const engMin = energies.length ? Math.min(...energies) : null;
  const engMax = energies.length ? Math.max(...energies) : null;

  const firstSlot = acSlots[0];
  const lastSlot = acSlots[acSlots.length - 1];
  const firstTrack = firstSlot ? tracksById.get(firstSlot.assignedTrackId!) : undefined;
  const lastTrack = lastSlot ? tracksById.get(lastSlot.assignedTrackId!) : undefined;

  function trackLabel(t: Track | undefined): string | null {
    if (!t) return null;
    return t.artist ? `${t.artist} — ${t.title}` : t.title;
  }

  return {
    playlistTitle: playlist.title,
    trackCount: acSlots.length,
    durationDisplay: fmtHM(totalDur),
    durationSeconds: totalDur,
    crateNames: attached.map(c => c.name),
    crateTrackCount: candidateCount,
    readinessGrade: "—",
    bpmRange: bpmMin !== null && bpmMax !== null ? `${Math.round(bpmMin)}–${Math.round(bpmMax)}` : "—",
    bpmMin,
    bpmMax,
    keySummary: keys.slice(0, 4).join(", ") || "—",
    energyRange: engMin !== null && engMax !== null ? `${engMin.toFixed(1)}–${engMax.toFixed(1)}` : "—",
    energyMin: engMin,
    energyMax: engMax,
    warningCount: acSlots.filter(s => s.warningMessages.length > 0).length,
    nextCandidateCount: candidateCount,
    openerTrack: trackLabel(firstTrack),
    closerTrack: trackLabel(lastTrack),
    notes: playlist.description ?? "",
  };
}

type SuggestionDef = {
  label: string;
  build: (ctx: PlaylistAssistantContext) => PlaylistAssistantDraft;
};

const SUGGESTIONS: SuggestionDef[] = [
  { label: "Smooth transitions",    build: buildSmoothTransitionsDraft },
  { label: "Extend to 2h",          build: buildExtendDurationDraft },
  { label: "Replace warning tracks",build: buildReplaceWarningsDraft },
  { label: "Find better opener",    build: buildBetterOpenerDraft },
  { label: "Find better closer",    build: buildBetterCloserDraft },
  { label: "Write description",     build: buildDescriptionDraft },
  { label: "Create alternate version", build: buildAlternateVersionDraft },
  { label: "Export copy",           build: buildExportCopyDraft },
];

// ── Draft card ────────────────────────────────────────────────────────────────

function DraftCard({
  draft, onCopy, onSaveToNotes, onClear,
}: {
  draft: PlaylistAssistantDraft;
  onCopy: () => void;
  onSaveToNotes: () => void;
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  function handleSave() {
    onSaveToNotes();
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="lpp-draft-card">
      <div className="lpp-draft-card-header">
        <span className="lpp-draft-card-title">{draft.title}</span>
        <span className="lpp-draft-card-date">{draft.createdAt}</span>
      </div>
      <p className="lpp-draft-card-summary">{draft.summary}</p>
      {draft.sections.map((sec, i) => (
        <div key={i} className="lpp-draft-section">
          <div className="lpp-draft-section-heading">{sec.heading}</div>
          {sec.body && <p className="lpp-draft-section-body">{sec.body}</p>}
          {sec.bullets && sec.bullets.length > 0 && (
            <ul className="lpp-draft-bullets">
              {sec.bullets.map((b, j) => <li key={j}>{b}</li>)}
            </ul>
          )}
        </div>
      ))}
      <div className="lpp-draft-card-actions">
        <button className="lpp-draft-btn" onClick={handleCopy}>{copied ? "Copied!" : "Copy Draft"}</button>
        <button className="lpp-draft-btn" onClick={handleSave}>{saved ? "Saved!" : "Save to Notes"}</button>
        <button className="lpp-draft-btn lpp-draft-btn--clear" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function FlowTab({
  slots, tracksById, selectedSlotIndex, onNodeClick,
  eligibilityContext,
  acceptedOption, hasGeneratedOptions, isOptionsStale, onOpenOptions, onRegenerate,
}: {
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
  selectedSlotIndex: number | null;
  onNodeClick: (idx: number) => void;
  eligibilityContext?: TrackEligibilityContext;
  acceptedOption?: PlaylistPathOption | null;
  hasGeneratedOptions?: boolean;
  isOptionsStale?: boolean;
  onOpenOptions?: () => void;
  onRegenerate?: () => void;
}) {
  return (
    <div className="lpp-flow-tab">
      {acceptedOption ? (
        <div className="lpp-accepted-summary">
          <span className="lpp-accepted-name">{acceptedOption.name}</span>
          <span className="lpp-chip">{acceptedOption.trackIds.length} tracks</span>
          <span className="lpp-chip">{fmtHM(acceptedOption.durationSeconds)}</span>
          {(acceptedOption.stats.redWarnings ?? 0) > 0 && (
            <span className="lpp-warn-red">{acceptedOption.stats.redWarnings} red</span>
          )}
          {(acceptedOption.stats.yellowWarnings ?? 0) > 0 && (
            <span className="lpp-warn-yellow">{acceptedOption.stats.yellowWarnings} yellow</span>
          )}
          {(acceptedOption.stats.redWarnings ?? 0) === 0 && (acceptedOption.stats.yellowWarnings ?? 0) === 0 && (
            <span className="lpp-clean">Clean</span>
          )}
          <div className="lpp-accepted-actions">
            {onOpenOptions && <button className="lpp-flow-btn" onClick={onOpenOptions}>Options</button>}
            {isOptionsStale && onRegenerate && (
              <button className="lpp-flow-btn lpp-flow-btn--stale" onClick={onRegenerate}>Regenerate</button>
            )}
          </div>
        </div>
      ) : hasGeneratedOptions ? (
        <div className="lpp-flow-cta">
          <span>Options generated — choose one to accept.</span>
          {onOpenOptions && <button className="lpp-flow-btn" onClick={onOpenOptions}>Review Options</button>}
        </div>
      ) : onRegenerate ? (
        <div className="lpp-flow-cta">
          <span>Ready to generate.</span>
          <button className="lpp-flow-btn" onClick={onRegenerate}>Generate Options</button>
        </div>
      ) : null}
      <div className="lpp-curve">
        <PlaylistFlowChart
          slots={slots}
          tracksById={tracksById}
          eligibilityContext={eligibilityContext}
          selectedSlotIndex={selectedSlotIndex}
          onSelectSlot={(idx) => { if (idx !== null) onNodeClick(idx); }}
        />
      </div>
    </div>
  );
}

function AssistantTab({
  ctx,
  onSaveDraftToNotes,
}: {
  ctx: PlaylistAssistantContext;
  onSaveDraftToNotes: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<PlaylistAssistantDraft | null>(null);

  function runSuggestion(build: (c: PlaylistAssistantContext) => PlaylistAssistantDraft) {
    setDraft(build(ctx));
    setInput("");
  }

  function runCustom() {
    if (!input.trim()) return;
    setDraft(buildCustomPromptDraft(input.trim(), ctx));
  }

  function handleCopy() {
    if (!draft) return;
    const text = formatDraftForClipboard(draft);
    navigator.clipboard?.writeText(text).catch(() => {
      // fallback: no-op — user can copy from the card manually
    });
  }

  function handleSaveToNotes() {
    if (!draft) return;
    const date = draft.createdAt;
    const text = formatDraftForNotes(draft, date);
    onSaveDraftToNotes(text);
  }

  return (
    <div className="lpp-assistant-tab">
      <div className="lpp-ctx-block">
        <div className="lpp-ctx-row"><span className="lpp-ctx-label">Playlist</span><span className="lpp-ctx-val">{ctx.playlistTitle}</span></div>
        <div className="lpp-ctx-row"><span className="lpp-ctx-label">Tracks</span><span className="lpp-ctx-val">{ctx.trackCount} · {ctx.durationDisplay}</span></div>
        {ctx.crateNames.length > 0 && <div className="lpp-ctx-row"><span className="lpp-ctx-label">Crates</span><span className="lpp-ctx-val">{ctx.crateNames.join(" · ")} · {ctx.crateTrackCount} tracks</span></div>}
        <div className="lpp-ctx-row"><span className="lpp-ctx-label">BPM</span><span className="lpp-ctx-val">{ctx.bpmRange}</span></div>
        <div className="lpp-ctx-row"><span className="lpp-ctx-label">Keys</span><span className="lpp-ctx-val">{ctx.keySummary}</span></div>
        {ctx.warningCount > 0 && <div className="lpp-ctx-row"><span className="lpp-ctx-label lpp-ctx-warn">Warnings</span><span className="lpp-ctx-val lpp-ctx-warn">{ctx.warningCount}</span></div>}
        {ctx.nextCandidateCount > 0 && <div className="lpp-ctx-row"><span className="lpp-ctx-label">Candidates</span><span className="lpp-ctx-val">{ctx.nextCandidateCount}</span></div>}
      </div>
      <div className="lpp-suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s.label} className="lpp-sug-chip" onClick={() => runSuggestion(s.build)}>{s.label}</button>
        ))}
      </div>
      <div className="lpp-input-row">
        <textarea
          className="lpp-input"
          placeholder="Ask about this playlist..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runCustom(); }}
          rows={2}
        />
        <button
          className="lpp-send-btn"
          disabled={!input.trim()}
          onClick={runCustom}
          title="Draft a local planning note (⌘Enter)"
        >Draft</button>
      </div>
      {draft && (
        <DraftCard
          draft={draft}
          onCopy={handleCopy}
          onSaveToNotes={handleSaveToNotes}
          onClear={() => setDraft(null)}
        />
      )}
    </div>
  );
}

function NotesTab({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="lpp-notes-tab">
      <textarea
        className="lpp-notes-input"
        placeholder="Playlist notes — mood, use case, broadcast ideas, things to avoid..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function CopyButton({ getText, label = "Copy" }: { getText: () => string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function handle() {
    const text = getText();
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button className="lpp-exp-copy-btn" onClick={handle}>{copied ? "Copied!" : label}</button>
  );
}

function ExportCard({
  title, content, warning, actions,
}: {
  title: string;
  content: string;
  warning?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="lpp-exp-card">
      <div className="lpp-exp-card-header">
        <span className="lpp-exp-card-title">{title}</span>
        {actions && <div className="lpp-exp-card-actions">{actions}</div>}
      </div>
      {warning && <div className="lpp-exp-warning">{warning}</div>}
      <pre className="lpp-exp-preview">{content}</pre>
    </div>
  );
}

function ExportTab({
  playlist, acSlots, tracksById, crates, onSaveToNotes,
}: {
  playlist: PlaylistRecord;
  acSlots: TrackSlot[];
  tracksById: Map<string, Track>;
  crates: CrateRecord[];
  onSaveToNotes: (text: string) => void;
}) {
  const [opts, setOpts] = useState<PlaylistExportOptions>(defaultExportOptions);

  const ctx = buildPlaylistExportContext(playlist, acSlots, tracksById, crates);

  const tracklist = formatTracklistCopy(ctx, opts);
  const ytDesc = formatYouTubeDescription(ctx, opts);
  const ytChapters = formatYouTubeChapters(ctx);
  const social = formatSocialCaption(ctx, opts);
  const broadcast = formatBroadcastCopy(ctx);

  const today = new Date().toISOString().slice(0, 10);

  function toggle(key: keyof PlaylistExportOptions) {
    setOpts(o => ({ ...o, [key]: !o[key] }));
  }

  return (
    <div className="lpp-export-tab">
      {/* Options strip */}
      <div className="lpp-exp-opts">
        <label className="lpp-exp-opt-label">
          <input type="checkbox" checked={opts.includeDurations} onChange={() => toggle("includeDurations")} />
          Durations
        </label>
        <label className="lpp-exp-opt-label">
          <input type="checkbox" checked={opts.includeBpmKey} onChange={() => toggle("includeBpmKey")} />
          BPM / Key
        </label>
        <label className="lpp-exp-opt-label">
          <input type="checkbox" checked={opts.includeTimestamps} onChange={() => toggle("includeTimestamps")} />
          Timestamps
        </label>
        <select
          className="lpp-exp-opt-select"
          value={opts.socialLength}
          onChange={(e) => setOpts(o => ({ ...o, socialLength: e.target.value as PlaylistExportOptions["socialLength"] }))}
        >
          <option value="short">Short caption</option>
          <option value="medium">Medium caption</option>
          <option value="broadcast">Broadcast</option>
        </select>
      </div>

      {/* Warnings */}
      {ctx.hasEstimatedDurations && (
        <div className="lpp-exp-warning-banner">⚠ Some durations are estimated — timestamps may be inaccurate.</div>
      )}
      {ctx.warningCount > 0 && (
        <div className="lpp-exp-warning-banner lpp-exp-warning-banner--info">{ctx.warningCount} transition warning{ctx.warningCount !== 1 ? "s" : ""} remain. Review before publishing if needed.</div>
      )}

      {/* Cards */}
      <ExportCard
        title="Tracklist"
        content={tracklist}
        actions={<>
          <CopyButton getText={() => tracklist} label="Copy Tracklist" />
          <button className="lpp-exp-copy-btn" onClick={() => onSaveToNotes(formatExportForNotes("Tracklist", tracklist, today))}>Save to Notes</button>
        </>}
      />

      <ExportCard
        title="YouTube Description"
        content={ytDesc}
        actions={<>
          <CopyButton getText={() => ytDesc} label="Copy" />
          <button className="lpp-exp-copy-btn" onClick={() => onSaveToNotes(formatExportForNotes("YouTube Description", ytDesc, today))}>Save to Notes</button>
        </>}
      />

      <ExportCard
        title="YouTube Chapters"
        content={ytChapters}
        warning={ctx.hasEstimatedDurations ? "Draft timestamps — verify before publishing." : "Timestamps based on analyzed durations."}
        actions={<CopyButton getText={() => ytChapters} label="Copy Chapters" />}
      />

      <ExportCard
        title="Social Caption"
        content={social}
        actions={<CopyButton getText={() => social} label="Copy" />}
      />

      <ExportCard
        title="Broadcast Copy"
        content={broadcast}
        actions={<CopyButton getText={() => broadcast} label="Copy" />}
      />

      <div className="lpp-exp-card lpp-exp-card--quiet">
        <div className="lpp-exp-card-header">
          <span className="lpp-exp-card-title">M3U / File Export</span>
        </div>
        <p className="lpp-exp-desc-text">Full M3U export is available in the Settings menu (⚙ at the top of the playlist view).</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type LowerPanelTab = "flow" | "assistant" | "notes" | "export";

type Props = {
  playlist: PlaylistRecord;
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
  locks: TrackLock[];
  crates: CrateRecord[];
  cratePoolTracks: Track[];
  nowPlayingSlotIndex: number | null;
  hoveredSlotIndex: number | null;
  selectedSlotIndex: number | null;
  onNodeHoverChange: (idx: number | null) => void;
  onNodeClick: (idx: number) => void;
  onUpdateNotes: (notes: string) => void;
  eligibilityContext?: TrackEligibilityContext;
  acceptedOption?: PlaylistPathOption | null;
  hasGeneratedOptions?: boolean;
  isOptionsStale?: boolean;
  onOpenOptions?: () => void;
  onRegenerate?: () => void;
};

export function PlaylistLowerPanel({
  playlist, slots, tracksById, crates, cratePoolTracks,
  selectedSlotIndex,
  onNodeClick, onUpdateNotes, eligibilityContext, acceptedOption,
  hasGeneratedOptions, isOptionsStale, onOpenOptions, onRegenerate,
}: Props) {
  const [tab, setTab] = useState<LowerPanelTab>("flow");
  const [collapsed, setCollapsed] = useState(false);
  const [pendingNotes, setPendingNotes] = useState<string | null>(null);

  const acSlots = slots.filter(s => s.assignedTrackId);
  const ctx = buildCtx(playlist, acSlots, tracksById, crates, cratePoolTracks.length);
  const notesValue = pendingNotes ?? (playlist.description ?? "");

  const handleNotesChange = useCallback((v: string) => {
    setPendingNotes(v);
    onUpdateNotes(v);
  }, [onUpdateNotes]);

  const handleSaveDraftToNotes = useCallback((appendText: string) => {
    const current = pendingNotes ?? (playlist.description ?? "");
    const next = current + appendText;
    setPendingNotes(next);
    onUpdateNotes(next);
    setTab("notes");
  }, [pendingNotes, playlist.description, onUpdateNotes]);

  return (
    <div className={`lpp${collapsed ? " lpp--collapsed" : ""}`}>
      <div className="lpp-header">
        <div className="lpp-tabs">
          {(["flow", "assistant", "notes", "export"] as LowerPanelTab[]).map((t) => (
            <button
              key={t}
              className={`lpp-tab${tab === t && !collapsed ? " lpp-tab--active" : ""}`}
              onClick={() => { if (collapsed) setCollapsed(false); setTab(t); }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button
          className="lpp-collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? "Show panel" : "Hide panel"}
        >{collapsed ? "▲" : "▼"}</button>
      </div>
      {!collapsed && (
        <div className="lpp-body">
          {tab === "flow" && (
            <FlowTab
              slots={slots}
              tracksById={tracksById}
              selectedSlotIndex={selectedSlotIndex}
              onNodeClick={onNodeClick}
              eligibilityContext={eligibilityContext}
              acceptedOption={acceptedOption}
              hasGeneratedOptions={hasGeneratedOptions}
              isOptionsStale={isOptionsStale}
              onOpenOptions={onOpenOptions}
              onRegenerate={onRegenerate}
            />
          )}
          {tab === "assistant" && (
            <AssistantTab
              ctx={ctx}
              onSaveDraftToNotes={handleSaveDraftToNotes}
            />
          )}
          {tab === "notes" && <NotesTab value={notesValue} onChange={handleNotesChange} />}
          {tab === "export" && (
            <ExportTab
              playlist={playlist}
              acSlots={acSlots}
              tracksById={tracksById}
              crates={crates}
              onSaveToNotes={handleSaveDraftToNotes}
            />
          )}
        </div>
      )}
    </div>
  );
}
