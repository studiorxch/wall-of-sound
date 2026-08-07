import type { DualDeckPerformMonitor, PerformDeckMonitor } from "../../logic/perform/dualDeckPerformMonitor";
import { gainsForPerformanceFader, performanceFaderPositionForGains } from "../../logic/perform/performanceGainControl";
import type { ManualDeckGainWriteResult } from "../../logic/perform/performanceGainControl";
import { PerformDeckWaveform } from "./PerformDeckWaveform";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function gainDb(gain: number): string {
  return gain <= 0 ? "-inf dB" : `${(20 * Math.log10(gain)).toFixed(1)} dB`;
}

function deckCanAcceptLevel(deck: PerformDeckMonitor): boolean {
  return Boolean(deck.state.trackId) && ["ready", "playing", "paused"].includes(deck.state.state);
}

function DeckPanel({ deck, manualGainEnabled, onSetDeckLevel }: {
  deck: PerformDeckMonitor;
  manualGainEnabled: boolean;
  onSetDeckLevel: (deckId: "A" | "B", gain: number) => ManualDeckGainWriteResult;
}) {
  const levelEnabled = manualGainEnabled && deckCanAcceptLevel(deck);
  return (
    <section className={`perform-deck perform-deck--${deck.state.role}`} aria-label={`Deck ${deck.deckId}`}>
      <header className="perform-deck__header">
        <div><span className="perform-eyebrow">Deck {deck.deckId}</span><strong>{deck.track?.title ?? "No track loaded"}</strong></div>
        <div className="perform-deck__role">{deck.state.role} · {deck.state.state}</div>
      </header>
      <div className="perform-deck__meta">
        <span>{deck.track?.artist ?? "—"}</span><span>{deck.track?.bpm?.toFixed(2) ?? "BPM —"}</span><span>{deck.track?.musicalKey ?? deck.track?.key ?? "Key —"}</span>
        <span>{formatTime(deck.state.currentTimeSeconds)} / {deck.state.durationSeconds ? formatTime(deck.state.durationSeconds) : "—"}</span>
      </div>
      <PerformDeckWaveform deck={deck} />
      <div className="perform-deck__truth">
        <div><span>Level</span><strong>{Math.round(deck.state.gain * 100)}%</strong><small>{gainDb(deck.state.gain)}</small></div>
        <div><span>Beat grid</span><strong>{deck.timing.beats ? "Trusted" : "Unavailable"}</strong></div>
        <div><span>Bar grid</span><strong>{deck.timing.bars ? "Trusted" : "Unavailable"}</strong></div>
        <div><span>Phrase grid</span><strong>{deck.timing.phrases ? "Trusted inferred" : "Unavailable"}</strong></div>
      </div>
      <label className="perform-level">
        <span>Deck {deck.deckId} LEVEL</span>
        <input
          aria-label={`Deck ${deck.deckId} level`}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={deck.state.gain}
          disabled={!levelEnabled}
          onChange={(event) => onSetDeckLevel(deck.deckId, Number(event.currentTarget.value))}
        />
      </label>
      <div className="perform-deck__cues">
        <div><span>Generic cues</span><strong>{deck.genericCues.length ? deck.genericCues.map((cue) => cue.label ?? formatTime(cue.timeSeconds)).join(" · ") : "None"}</strong></div>
        <div><span>DJ transition cue</span><strong>{deck.transitionCue ? `${formatTime(deck.transitionCue.seconds)}${deck.transitionCue.manuallyAdjusted ? " · manual" : ""}` : "None"}</strong></div>
        <div><span>Selected region</span><strong>{deck.selectedRegion ? `${deck.selectedRegion.role} · ${formatTime(deck.selectedRegion.startSeconds)}–${formatTime(deck.selectedRegion.endSeconds)}` : "None"}</strong></div>
      </div>
    </section>
  );
}

export interface DualDeckPerformWorkspaceProps {
  monitor: DualDeckPerformMonitor;
  manualGainEnabled: boolean;
  onSetDeckLevel: (deckId: "A" | "B", gain: number) => ManualDeckGainWriteResult;
  onSetDeckLevels: (gains: Record<"A" | "B", number>) => ManualDeckGainWriteResult;
}

export function DualDeckPerformWorkspace({ monitor, manualGainEnabled, onSetDeckLevel, onSetDeckLevels }: DualDeckPerformWorkspaceProps) {
  const { transition } = monitor;
  const faderPosition = performanceFaderPositionForGains(monitor.decks.A.state.gain, monitor.decks.B.state.gain);
  const faderEnabled = manualGainEnabled && deckCanAcceptLevel(monitor.decks.A) && deckCanAcceptLevel(monitor.decks.B);
  return (
    <main className="perform-workspace">
      <div className="perform-title"><span className="perform-eyebrow">MUSIC / Perform</span><h1>Dual-deck transition monitor</h1><p>Live channel levels over the current prepared-playback runtime.</p></div>
      <DeckPanel deck={monitor.decks.A} manualGainEnabled={manualGainEnabled} onSetDeckLevel={onSetDeckLevel} />
      <section className="perform-transition" aria-label="Transition status">
        <span className="perform-eyebrow">Transition status</span>
        <strong className="perform-transition__family">{transition.plan?.family.replace(/_/g, " ") ?? "No exact live plan"}</strong>
        <div className="perform-transition__grid">
          <span>Adjacency</span><strong>{transition.adjacency ? `${transition.adjacency.outgoingSlotId} → ${transition.adjacency.incomingSlotId}` : "Unavailable"}</strong>
          <span>Evidence</span><strong>{transition.plan?.evidenceState ?? "Unavailable"}</strong>
          <span>Currency</span><strong>{transition.stale == null ? "Unavailable" : transition.stale ? "Stale" : "Current"}</strong>
          <span>Authority now</span><strong>{transition.authority ? `${transition.authority.gate} · ${transition.authority.reason}` : "Unavailable until both decks form an exact live adjacency"}</strong>
          <span>Compiled strategy</span><strong>{transition.compiledStrategy ?? "None"}</strong>
          <span>Runway</span><strong>{transition.runwayBars ? `${transition.runwayBars} bars` : "None"}</strong>
          <span>Cues</span><strong>{transition.outgoingCueRole && transition.incomingCueRole ? `${transition.outgoingCueRole} → ${transition.incomingCueRole}` : "None"}</strong>
          <span>Progress</span><strong>{transition.transitionProgress == null ? "Not running" : `${Math.round(transition.transitionProgress * 100)}%`}</strong>
          <span>Remaining</span><strong>{transition.remainingBars == null ? "None" : `${transition.remainingBars.toFixed(1)} bars`}</strong>
          <span>Last actual path</span><strong>{transition.actualExecution.replace(/_/g, " ")}{transition.actualExecutionAdjacency ? ` · ${transition.actualExecutionAdjacency}` : ""}</strong>
          <span>Fallback reason</span><strong>{transition.actualExecutionReason ?? "None"}</strong>
        </div>
        <label className="perform-fader">
          <span>Performance fader</span>
          <input
            aria-label="Performance fader"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={faderPosition}
            disabled={!faderEnabled}
            onChange={(event) => onSetDeckLevels(gainsForPerformanceFader(Number(event.currentTarget.value)))}
          />
          <strong>A {Math.round(monitor.decks.A.state.gain * 100)}% · B {Math.round(monitor.decks.B.state.gain * 100)}%</strong>
          <small>{faderEnabled ? "Equal-power macro over both channel levels" : "Unavailable until both decks are loaded and transition execution is idle"}</small>
        </label>
      </section>
      <DeckPanel deck={monitor.decks.B} manualGainEnabled={manualGainEnabled} onSetDeckLevel={onSetDeckLevel} />
      <div className="perform-legend"><span className="is-playhead">Playhead</span><span className="is-transition">DJ transition cue</span><span className="is-generic">Generic cue</span><span className="is-region">Selected region</span></div>
    </main>
  );
}
