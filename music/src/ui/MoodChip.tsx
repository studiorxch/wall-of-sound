import { getMoodColorToken } from "../logic/moodTaxonomy";

type MoodChipProps = {
  label: string;
  suggested?: boolean;
  className?: string;
};

/** Single mood chip — color driven by mood group taxonomy. */
export function MoodChip({ label, suggested = false, className = "" }: MoodChipProps) {
  const token = getMoodColorToken(label);
  const style = suggested
    ? { "--mc-token": `var(${token})` } as React.CSSProperties
    : { "--mc-token": `var(${token})` } as React.CSSProperties;
  const cls = `mood-chip${suggested ? " mood-chip-suggested" : ""}${className ? ` ${className}` : ""}`;
  return (
    <span className={cls} style={style}>{label}</span>
  );
}

type MoodChipsRowProps = {
  tags: string[];
  suggested?: boolean;
  max?: number;
};

/** Row of mood chips for a track, limited to `max` with overflow count. */
export function MoodChipsRow({ tags, suggested = false, max = 3 }: MoodChipsRowProps) {
  if (!tags.length) return suggested ? <span className="dim">—</span> : null;
  const visible = tags.slice(0, max);
  const overflow = tags.length - visible.length;
  return (
    <span className="mood-chips">
      {visible.map((t) => <MoodChip key={t} label={t} suggested={suggested} />)}
      {overflow > 0 && <span className="mood-chip mood-chip-more">+{overflow}</span>}
    </span>
  );
}
