// RadioLoop Library Foundation — "Promote to Radio" interface (build spec
// §6). Reuses the existing npw-* modal CSS system (NewPlaylistWizard/
// ImportAudioModal) rather than introducing a new one.
//
// Guardrails from the spec, enforced here:
// - Duplicate promotion is disabled while an operation is running.
// - Success is never claimed until the orchestrator itself reports ok —
//   the dialog only reflects what the server actually confirmed.
// - Retry is allowed after a failed operation (the same Promote button).
// - No raw subprocess output (stderrTail) is rendered — RadioValidationIssue
//   structurally carries only code/message/severity, so there's nothing to
//   accidentally leak here.
// - A stem-omission warning is shown as its own prominent banner, not just
//   folded into the generic issues list, since the core can otherwise
//   succeed silently-with-a-caveat.

import { useState } from "react";
import type { LoopAsset } from "../../data/loopTypes";
import { RADIO_ARRANGEMENT_ROLES, type RadioPromotionFormInput } from "../../data/radioLoopTypes";
import type { PromoteLoopToRadioResult, RadioPromotionPhase } from "../../logic/radio/radioPromotionOrchestrator";
import type { SongRoleSuggestion, SongSectionVerification } from "../../data/songAnalysisTypes";
import type { MoodScore } from "../../logic/MoodAnalyzer";

const PHASE_LABEL: Record<RadioPromotionPhase, string> = {
  validating: "Validating…",
  creating_staging_operation: "Creating staging operation…",
  rendering_lossless: "Rendering lossless intermediate…",
  encoding_core: "Encoding Opus…",
  finalizing: "Finalizing package & manifest…",
  complete: "Complete",
  failed: "Failed",
};

// 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map §9 — new optional
// display-only props, matching the onOpenRadioLoops precedent from 0717B
// exactly (additive, LoopLibraryView's existing call site omits them,
// unaffected). Suggestions are advisory display only, never auto-filled
// into the form — the user still manually picks/confirms role and moods.
export interface PromoteToRadioSongIntelligence {
  sourceSection?: { displayLabel: string; verification: SongSectionVerification };
  suggestedRoles?: SongRoleSuggestion;
  suggestedMoods?: MoodScore[];
  technicalSummary?: { bpm?: number; musicalKey?: string; energySummary?: string; entryExitQuality?: string };
}

type Props = {
  loop: LoopAsset;
  onPromote: (loopId: string, formInput: RadioPromotionFormInput, onProgress?: (phase: RadioPromotionPhase) => void) => Promise<PromoteLoopToRadioResult>;
  onClose: () => void;
  // 0717B §8.4/§9 — optional secondary action shown only after a
  // successful promotion. Omitted by LoopLibraryView's existing call site
  // (unchanged behavior there); provided by the Sectional Looper bridge.
  onOpenRadioLoops?: (radioLoopId: string) => void;
  songIntelligence?: PromoteToRadioSongIntelligence;
};

export function PromoteToRadioDialog({ loop, onPromote, onClose, onOpenRadioLoops, songIntelligence }: Props) {
  // 0717A correction: closed RadioArrangementRole vocabulary (a <select>),
  // not free text — the pre-0717A "atmosphere" suggestion kept minting
  // roles the RadioLoops workspace would then have to flag as legacy.
  const [role, setRole] = useState("");
  const [approved, setApproved] = useState(false);
  const [energy, setEnergy] = useState("");
  const [density, setDensity] = useState("");
  const [stability, setStability] = useState("");
  const [maxRepeats, setMaxRepeats] = useState("");
  const [minRest, setMinRest] = useState("");

  const [phase, setPhase] = useState<RadioPromotionPhase | "idle">("idle");
  const [result, setResult] = useState<PromoteLoopToRadioResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    setPhase("validating");
    const formInput: RadioPromotionFormInput = {
      arrangementRole: role.trim(),
      publicUseApproved: approved,
      energy: energy === "" ? undefined : Number(energy),
      density: density === "" ? undefined : Number(density),
      stability: stability === "" ? undefined : Number(stability),
      maximumConsecutiveRepeats: maxRepeats === "" ? undefined : Number(maxRepeats),
      minimumRestCycles: minRest === "" ? undefined : Number(minRest),
    };
    const r = await onPromote(loop.id, formInput, (p) => setPhase(p));
    setResult(r);
    setSubmitting(false);
  }

  const showResult = result !== null;
  const nonStemIssues = (result?.issues ?? []).filter((i) => i.code !== "RADIO_STEMS_OMITTED" && i.code !== "RADIO_STEM_DURATION_MISMATCH" && i.code !== "RADIO_STEM_PROBE_INVALID");

  return (
    <div className="npw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="npw-modal">
        <div className="npw-header">
          <div className="npw-header-title">Promote to Radio — {loop.title}</div>
          <button className="npw-close" onClick={onClose} disabled={submitting}>✕</button>
        </div>
        <div className="npw-body">
          <div className="npw-step-label">Loop</div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "0 0 12px" }}>
            {loop.sourceTitle}{loop.sourceArtist ? ` — ${loop.sourceArtist}` : ""} · {loop.bpm ? `${Math.round(loop.bpm)} BPM` : "BPM unknown"} · {loop.key ?? "key unknown"} · {loop.barCount ? `${loop.barCount} bars` : "length unknown"}
          </p>

          {/* 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map §9 — a
              read-only advisory info block. Nothing here auto-fills the
              form below; the user always confirms role/moods explicitly. */}
          {songIntelligence && (songIntelligence.sourceSection || songIntelligence.suggestedRoles || songIntelligence.suggestedMoods || songIntelligence.technicalSummary) && (
            <div style={{ fontSize: 11, marginBottom: 12, padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }}>
              {songIntelligence.sourceSection && (
                <div>Source section: {songIntelligence.sourceSection.displayLabel} ({songIntelligence.sourceSection.verification})</div>
              )}
              {songIntelligence.suggestedRoles && songIntelligence.suggestedRoles.length > 0 && (
                <div>Suggested role: {songIntelligence.suggestedRoles.slice(0, 2).map((r) => `${r.role} (${r.confidence.toFixed(2)})`).join(", ")}</div>
              )}
              {songIntelligence.suggestedMoods && songIntelligence.suggestedMoods.length > 0 && (
                <div>Suggested moods: {songIntelligence.suggestedMoods.slice(0, 3).map((m) => `${m.mood} (${m.confidence.toFixed(2)})`).join(", ")}</div>
              )}
              {songIntelligence.technicalSummary && (
                <div>
                  {songIntelligence.technicalSummary.bpm ? `${Math.round(songIntelligence.technicalSummary.bpm)} BPM · ` : ""}
                  {songIntelligence.technicalSummary.musicalKey ?? ""}
                  {songIntelligence.technicalSummary.energySummary ? ` · energy: ${songIntelligence.technicalSummary.energySummary}` : ""}
                  {songIntelligence.technicalSummary.entryExitQuality ? ` · entry/exit: ${songIntelligence.technicalSummary.entryExitQuality}` : ""}
                </div>
              )}
            </div>
          )}

          <div className="npw-step-label">Arrangement role *</div>
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={submitting} style={{ width: "100%", marginBottom: 10 }}>
            <option value="">Select a role…</option>
            {RADIO_ARRANGEMENT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 14 }}>
            <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} disabled={submitting} />
            Public-use approved *
          </label>

          <div className="npw-step-label">Optional arrangement tuning</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 11 }}>Energy (0–1)
              <input type="number" min={0} max={1} step={0.05} value={energy} onChange={(e) => setEnergy(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
            <label style={{ fontSize: 11 }}>Density (0–1)
              <input type="number" min={0} max={1} step={0.05} value={density} onChange={(e) => setDensity(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
            <label style={{ fontSize: 11 }}>Stability (0–1)
              <input type="number" min={0} max={1} step={0.05} value={stability} onChange={(e) => setStability(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <label style={{ fontSize: 11 }}>Max consecutive repeats
              <input type="number" min={1} step={1} value={maxRepeats} onChange={(e) => setMaxRepeats(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
            <label style={{ fontSize: 11 }}>Min rest cycles
              <input type="number" min={0} step={1} value={minRest} onChange={(e) => setMinRest(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
          </div>

          {phase !== "idle" && (
            <div style={{ fontSize: 12, marginBottom: 10, color: "rgba(255,255,255,0.75)" }}>
              {submitting ? PHASE_LABEL[phase as RadioPromotionPhase] : null}
            </div>
          )}

          {showResult && result?.stemsOmitted && (
            <div style={{ fontSize: 12, marginBottom: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(230,180,40,0.12)", border: "1px solid rgba(230,180,40,0.4)", color: "rgba(255,220,140,0.95)" }}>
              ⚠ Stems omitted — one or more stems did not match the core's duration within tolerance, so no stems were included. The core package is unaffected.
            </div>
          )}

          {showResult && nonStemIssues.length > 0 && (
            <div style={{ fontSize: 12, marginBottom: 10 }}>
              {nonStemIssues.map((issue, i) => (
                <div key={i} style={{ padding: "4px 0", color: issue.severity === "error" ? "rgba(255,120,120,0.95)" : "rgba(255,210,120,0.95)" }}>
                  {issue.severity === "error" ? "✕" : "⚠"} {issue.message}
                </div>
              ))}
            </div>
          )}

          {showResult && (
            <div style={{ fontSize: 12, marginBottom: 14, padding: "8px 10px", borderRadius: 6, background: result?.ok ? "rgba(64,217,176,0.1)" : "rgba(255,120,120,0.08)" }}>
              <div>Status: <strong>{result?.ok ? "RADIO_READY" : "Failed"}</strong></div>
              {result?.radioLoopId && <div>RadioLoop ID: {result.radioLoopId}</div>}
              {result?.packageVersion != null && <div>Package version: {result.packageVersion}</div>}
              <div>Manifest: {result?.ok ? "included" : "not updated"}</div>
              {result?.ok && <div>Now visible in RADIO Inbox.</div>}
            </div>
          )}

          <div className="npw-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onClose} disabled={submitting}>Close</button>
            {result?.ok && result.radioLoopId && onOpenRadioLoops && (
              <button className="npw-btn npw-btn--ghost" onClick={() => onOpenRadioLoops(result.radioLoopId!)}>
                Open in RADIO
              </button>
            )}
            <button className="npw-btn npw-btn--primary" onClick={handleSubmit} disabled={submitting || result?.ok === true}>
              {submitting ? "Promoting…" : showResult && !result?.ok ? "Retry" : "Promote to Radio"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
