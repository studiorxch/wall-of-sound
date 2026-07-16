import { MOOD_GROUPS, type MoodGroupId } from "../logic/moodTaxonomy";

type CrateMoodPickerProps = {
  activeGroup: MoodGroupId | "all";
  onChange: (group: MoodGroupId | "all") => void;
  counts?: Partial<Record<MoodGroupId, number>>;
};

export function CrateMoodPicker({ activeGroup, onChange, counts }: CrateMoodPickerProps) {
  return (
    <div className="cmp-bar">
      <button
        className={`cmp-btn${activeGroup === "all" ? " cmp-btn--active" : ""}`}
        onClick={() => onChange("all")}
      >
        All Crates
      </button>
      {MOOD_GROUPS.map((group) => {
        const count = counts?.[group.id];
        const isActive = activeGroup === group.id;
        return (
          <button
            key={group.id}
            className={`cmp-btn${isActive ? " cmp-btn--active" : ""}`}
            style={{ "--cmp-color": `var(${group.colorToken})` } as React.CSSProperties}
            onClick={() => onChange(isActive ? "all" : group.id)}
            title={group.label}
          >
            {group.label}
            {count != null && <span className="cmp-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
