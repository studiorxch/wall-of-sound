import { GeographicHexColorField } from "./GeographicHexColorField";
import type { GeographicField } from "../../logic/maps/geographicTargets";

// 0729_MAPS_Visual_Property_Authority_Audit — dispatches to the right
// editor for a field's real kind instead of assuming every field is a
// color. Opacity is a genuine, independently wired numeric paint property
// (line-opacity/fill-opacity); boolean is a runtime overlay on/off toggle
// (e.g. AtmosphereComposite) — neither is a color, so neither goes through
// the HEX-first editor.

type Props = {
  field: GeographicField;
  onChange: (value: string) => void;
};

export function GeographicFieldEditor({ field, onChange }: Props) {
  if (field.valueKind === "opacity") {
    const n = parseFloat(field.value);
    const safe = isNaN(n) ? 1 : Math.max(0, Math.min(1, n));
    return (
      <span className="geo-opacity-field">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          className="geo-opacity-slider"
        />
        <span className="geo-opacity-value">{Math.round(safe * 100)}%</span>
      </span>
    );
  }

  if (field.valueKind === "boolean") {
    const on = field.value === "true";
    return (
      <label className="geo-bool-field">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        />
        <span>{on ? "On" : "Off"}</span>
      </label>
    );
  }

  // Color kind, including expression values — the caller shows a separate
  // warning note for those (editing here still works, it just flattens
  // whatever zoom-stop/branch expression was there, same as before this
  // build; the editor itself doesn't need to know that).
  return <GeographicHexColorField value={field.value} onChange={onChange} />;
}
