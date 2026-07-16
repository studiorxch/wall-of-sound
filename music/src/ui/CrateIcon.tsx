import type { MoodGroupId } from "../logic/moodTaxonomy";
import type { CrateVisualType } from "../logic/crateMoodSummary";

const MOOD_ICONS: Record<MoodGroupId, string> = {
  drive:   "↯",   // bolt / kinetic
  joy:     "✦",   // spark / bloom
  wonder:  "✶",   // star / orbit
  trust:   "⬡",   // shield / hexagon
  calm:    "〜",  // wave / horizon
  dream:   "◐",   // moon / portal
  fear:    "▲",   // triangle / shadow
  neutral: "▪",   // square / plain mark
};

const SOURCE_ICONS: Record<string, string> = {
  "source-cat":   "▦",   // internal / grid / library vault
  "source-ext":   "↗",   // external / arrow-out / outside signal
  "source-mixed": "⊞",   // mixed sources
  "source-ref":   "◉",   // reference / bookmark / eye
  "source-art":   "◎",   // artist / person / node
  system:         "⚙",
  unknown:        "◇",
};

type CrateIconProps = {
  type: CrateVisualType;
  moodGroup?: MoodGroupId;
  iconKey?: string;
  className?: string;
};

export function CrateIcon({ moodGroup, iconKey, className = "" }: CrateIconProps) {
  const glyph = moodGroup
    ? MOOD_ICONS[moodGroup]
    : (iconKey ? (SOURCE_ICONS[iconKey] ?? SOURCE_ICONS.unknown) : SOURCE_ICONS.unknown);

  return (
    <span className={`crate-icon${className ? ` ${className}` : ""}`} aria-hidden>
      {glyph}
    </span>
  );
}
