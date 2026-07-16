// 0714S — persistent loop-audition transport (§7). Rendered inside the
// always-mounted player-sampler-bar (music/src/App.tsx) so it survives
// navigation away from the Sectional Looper — the core fix for "loop
// preview audio can continue after navigation while controls disappear."

import type { LoopAuditionSession } from "../../data/loopTypes";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

interface Props {
  session: LoopAuditionSession;
  loopIteration: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onOpenInLooper: () => void;
}

export function LoopAuditionBar({
  session, loopIteration, onPause, onResume, onStop, onPrevious, onNext, onOpenInLooper,
}: Props) {
  const duration = Math.max(0.001, session.endSeconds - session.startSeconds);
  const relative = Math.max(0, Math.min(duration, session.currentRelativeSeconds));

  return (
    <div className="loop-audition-bar" role="region" aria-label="Loop preview transport">
      <div className="loop-audition-label">LOOP PREVIEW</div>
      <div className="loop-audition-title">{session.sourceTitle}</div>
      <div className="loop-audition-section">{session.sectionLabel ?? ""}</div>
      <div className="loop-audition-position" aria-live="polite">
        {fmt(relative)} / {fmt(duration)} · Loop {loopIteration + 1}
      </div>
      <div className="loop-audition-controls">
        <button onClick={onPrevious} aria-label="Previous candidate">⏮</button>
        {session.status === "playing"
          ? <button onClick={onPause} aria-label="Pause">⏸</button>
          : <button onClick={() => void onResume()} aria-label="Resume">▶</button>}
        <button onClick={onStop} aria-label="Stop">⏹</button>
        <button onClick={onNext} aria-label="Next candidate">⏭</button>
        <button onClick={onOpenInLooper} className="loop-audition-open">Open in Looper</button>
      </div>
      {session.timingAuthority === "media_element" && (
        <div className="loop-audition-fallback-notice" role="status">
          Preview timing: Media fallback
          <br />
          Loop wrap may not be sample-accurate
        </div>
      )}
      {session.status === "error" && (
        <div className="loop-audition-error" role="alert">Preview playback error — try Resume.</div>
      )}
    </div>
  );
}
