import type { TrackSlot } from "../data/playlistTypes";

type Props = { slots: TrackSlot[] };

export function WarningPanel({ slots }: Props) {
  const warnings = slots.filter((s) => s.warningLevel !== "none");
  if (warnings.length === 0) {
    return (
      <div className="panel warning-panel">
        <h3>Warnings</h3>
        <p className="empty-msg clean-msg">No warnings — curve is satisfied.</p>
      </div>
    );
  }

  return (
    <div className="panel warning-panel">
      <h3>Warnings ({warnings.length})</h3>
      <ul className="warning-list">
        {warnings.map((s) => (
          <li key={s.slotId} className={`warn-item warn-${s.warningLevel}`}>
            <span className="warn-slot">Slot {s.slotIndex + 1}</span>
            <ul>
              {s.warningMessages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
