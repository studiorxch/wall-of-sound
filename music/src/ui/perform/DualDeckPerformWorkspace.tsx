import type { DualDeckPerformMonitor, PerformDeckMonitor } from "../../logic/perform/dualDeckPerformMonitor";
import { PerformDeckWaveform } from "./PerformDeckWaveform";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function gainDb(gain: number): string {
  return gain <= 0 ? "-inf dB" : `${(20 * Math.log10(gain)).toFixed(1)} dB`;
}

function DeckPanel({ deck }: { deck: PerformDeckMonitor }) {
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
      <div className="perform-deck__cues">
        <div><span>Generic cues</span><strong>{deck.genericCues.length ? deck.genericCues.map((cue) => cue.label ?? formatTime(cue.timeSeconds)).join(" · ") : "None"}</strong></div>
        <div><span>DJ transition cue</span><strong>{deck.transitionCue ? `${formatTime(deck.transitionCue.seconds)}${deck.transitionCue.manuallyAdjusted ? " · manual" : ""}` : "None"}</strong></div>
        <div><span>Selected region</span><strong>{deck.selectedRegion ? `${deck.selectedRegion.role} · ${formatTime(deck.selectedRegion.startSeconds)}–${formatTime(deck.selectedRegion.endSeconds)}` : "None"}</strong></div>
      </div>
    </section>
  );
}

export function DualDeckPerformWorkspace({ monitor }: { monitor: DualDeckPerformMonitor }) {
  const { transition } = monitor;
  return (
    <main className="perform-workspace">
      <div className="perform-title"><span className="perform-eyebrow">MUSIC / Perform</span><h1>Dual-deck transition monitor</h1><p>Read-only view of the current prepared-playback runtime.</p></div>
      <DeckPanel deck={monitor.decks.A} />
      <section className="perform-transition" aria-label="Transition status">
        <span className="perform-eyebrow">Transition status</span>
        <strong className="perform-transition__family">{transition.plan?.family.replace(/_/g, " ") ?? "No exact live plan"}</strong>
        <div className="perform-transition__grid">
          <span>Adjacency</span><strong>{transition.adjacency ? `${transition.adjacency.outgoingSlotId} → ${transition.adjacency.incomingSlotId}` : "Unavailable"}</strong>
          <span>Evidence</span><strong>{transition.plan?.evidenceState ?? "Unavailable"}</strong>
          <span>Currency</span><strong>{transition.stale == null ? "Unavailable" : transition.stale ? "Stale" : "Current"}</strong>
          <span>Authority now</span><strong>{transition.authority ? `${transition.authority.gate} · ${transition.authority.reason}` : "Unavailable until both decks form an exact live adjacency"}</strong>
          <span>Compiled strategy</span><strong>{transition.compiledStrategy ?? "None"}</strong>
          <span>Last actual path</span><strong>{transition.actualExecution.replace(/_/g, " ")}{transition.actualExecutionAdjacency ? ` · ${transition.actualExecutionAdjacency}` : ""}</strong>
          <span>Fallback reason</span><strong>{transition.actualExecutionReason ?? "None"}</strong>
        </div>
      </section>
      <DeckPanel deck={monitor.decks.B} />
      <div className="perform-legend"><span className="is-playhead">Playhead</span><span className="is-transition">DJ transition cue</span><span className="is-generic">Generic cue</span><span className="is-region">Selected region</span></div>
    </main>
  );
}
