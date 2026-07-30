import { useState } from "react";

// 0729_MAPS_Geographic_Catalog_Dual_View — HEX-first color editing.
// Primary control is one text field: accepts "#6B6238", "6B6238", or
// lowercase, normalizes to uppercase "#RRGGBB" on commit. The swatch is a
// native <input type="color"> wired to the same value (a free, real OS
// eyedropper/picker, not a second source of truth) plus an explicit
// EyeDropper API button where the browser supports it. Opacity is a
// read-only display slot, kept visually separate from the color value
// itself, never packed into the hex — there is no real write path for
// opacity yet (see completion report), so this never claims to be editable.

type Props = {
  value: string;
  onChange: (hex: string) => void;
  opacityDisplay?: string;
  disabled?: boolean;
};

function normalizeHex(input: string): string | null {
  const stripped = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(stripped)) return null;
  return `#${stripped.toUpperCase()}`;
}

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

export function GeographicHexColorField({ value, onChange, opacityDisplay, disabled }: Props) {
  const validCurrent = isValidHex(value) ? value.toUpperCase() : "#000000";
  const displayValue = isValidHex(value) ? value.toUpperCase() : value;

  const [draft, setDraft] = useState(displayValue);
  const [invalid, setInvalid] = useState(false);
  // React's documented "adjusting state when a prop changes" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect) — reflects an
  // external change (e.g. a bulk action touching this field while its row
  // stays mounted) without clobbering an in-progress edit, and without an
  // effect+extra-render round trip.
  const [lastSeenValue, setLastSeenValue] = useState(displayValue);
  if (displayValue !== lastSeenValue) {
    setLastSeenValue(displayValue);
    setDraft(displayValue);
    setInvalid(false);
  }

  function commit(raw: string) {
    const normalized = normalizeHex(raw);
    if (normalized) {
      setDraft(normalized);
      setInvalid(false);
      if (normalized !== validCurrent) onChange(normalized);
    } else {
      setInvalid(true);
    }
  }

  return (
    <span className="geo-hex-field">
      <input
        type="color"
        className="geo-hex-swatch"
        value={validCurrent}
        disabled={disabled}
        onChange={(e) => { setDraft(e.target.value.toUpperCase()); setInvalid(false); onChange(e.target.value.toUpperCase()); }}
        title="Pick a color"
      />
      <input
        type="text"
        className={`geo-hex-input${invalid ? " geo-hex-input--invalid" : ""}`}
        value={draft}
        disabled={disabled}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => { setDraft(e.target.value); setInvalid(false); }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          if (e.key === "Escape") { setDraft(validCurrent); setInvalid(false); }
        }}
        title="HEX color — accepts #RRGGBB, RRGGBB, or lowercase"
      />
      {hasEyeDropper && !disabled && (
        <button
          type="button"
          className="geo-hex-eyedropper"
          title="Pick color from screen"
          onClick={async () => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const result = await new (window as any).EyeDropper().open();
              const normalized = normalizeHex(result.sRGBHex);
              if (normalized) { setDraft(normalized); onChange(normalized); }
            } catch {
              // user cancelled the eyedropper — no-op
            }
          }}
        >
          ◎
        </button>
      )}
      {opacityDisplay != null && <span className="geo-hex-opacity" title="Opacity (read-only)">{opacityDisplay}</span>}
    </span>
  );
}
