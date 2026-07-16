type Props = {
  targetDurationSeconds: number;
  onChange: (seconds: number) => void;
};

const PRESETS = [
  { label: "1 hr", value: 3600 },
  { label: "2 hr", value: 7200 },
  { label: "3 hr", value: 10800 },
];

export function TargetDurationPanel({ targetDurationSeconds, onChange }: Props) {
  const minutes = Math.round(targetDurationSeconds / 60);

  return (
    <div className="panel duration-panel">
      <h3>Target Duration</h3>
      <div className="duration-presets">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            className={targetDurationSeconds === p.value ? "active" : ""}
            onClick={() => onChange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="duration-custom">
        <label>
          Custom:
          <input
            type="number"
            min={10}
            max={480}
            value={minutes}
            onChange={(e) => onChange(parseInt(e.target.value, 10) * 60)}
          />
          min
        </label>
      </div>
    </div>
  );
}
