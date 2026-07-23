import chevronLeftRaw from "@material-symbols/svg-400/outlined/chevron_left.svg?raw";
import chevronRightRaw from "@material-symbols/svg-400/outlined/chevron_right.svg?raw";
import libraryMusicRaw from "@material-symbols/svg-400/outlined/library_music.svg?raw";
import publicRaw from "@material-symbols/svg-400/outlined/public.svg?raw";
import graphicEqRaw from "@material-symbols/svg-400/outlined/graphic_eq.svg?raw";
import artistRaw from "@material-symbols/svg-400/outlined/artist.svg?raw";
import scienceRaw from "@material-symbols/svg-400/outlined/science.svg?raw";
import inventory2Raw from "@material-symbols/svg-400/outlined/inventory_2.svg?raw";
import queueMusicRaw from "@material-symbols/svg-400/outlined/queue_music.svg?raw";
import gridViewRaw from "@material-symbols/svg-400/outlined/grid_view.svg?raw";
import uploadRaw from "@material-symbols/svg-400/outlined/upload.svg?raw";

export type IconName =
  | "chevron_left"
  | "chevron_right"
  | "library_music"
  | "public"
  | "graphic_eq"
  | "artist"
  | "science"
  | "inventory_2"
  | "queue_music"
  | "grid_view"
  | "upload";

// Material Symbols Outlined ships with no explicit fill, which defaults to
// black — force currentColor so every icon inherits its row's foreground.
function currentColor(svg: string): string {
  return svg.replace("<svg ", '<svg fill="currentColor" ');
}

const ICONS: Record<IconName, string> = {
  chevron_left: currentColor(chevronLeftRaw),
  chevron_right: currentColor(chevronRightRaw),
  library_music: currentColor(libraryMusicRaw),
  public: currentColor(publicRaw),
  graphic_eq: currentColor(graphicEqRaw),
  artist: currentColor(artistRaw),
  science: currentColor(scienceRaw),
  inventory_2: currentColor(inventory2Raw),
  queue_music: currentColor(queueMusicRaw),
  grid_view: currentColor(gridViewRaw),
  upload: currentColor(uploadRaw),
};

type IconProps = {
  name: IconName;
  className?: string;
};

/** Monochrome Material Symbols Outlined glyph. Fixed size, no per-instance color. */
export function Icon({ name, className = "" }: IconProps) {
  return (
    <span
      className={`icon${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
