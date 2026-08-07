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
import paletteRaw from "@material-symbols/svg-400/outlined/palette.svg?raw";
import mapRaw from "@material-symbols/svg-400/outlined/map.svg?raw";
import directionsCarRaw from "@material-symbols/svg-400/outlined/directions_car.svg?raw";
import layersRaw from "@material-symbols/svg-400/outlined/layers.svg?raw";
import routeRaw from "@material-symbols/svg-400/outlined/route.svg?raw";
import directionsWalkRaw from "@material-symbols/svg-400/outlined/directions_walk.svg?raw";
import directionsBikeRaw from "@material-symbols/svg-400/outlined/directions_bike.svg?raw";
import addRaw from "@material-symbols/svg-400/outlined/add.svg?raw";
import moreVertRaw from "@material-symbols/svg-400/outlined/more_vert.svg?raw";
import dragIndicatorRaw from "@material-symbols/svg-400/outlined/drag_indicator.svg?raw";
import deleteRaw from "@material-symbols/svg-400/outlined/delete.svg?raw";
import editRaw from "@material-symbols/svg-400/outlined/edit.svg?raw";
import searchRaw from "@material-symbols/svg-400/outlined/search.svg?raw";
import closeRaw from "@material-symbols/svg-400/outlined/close.svg?raw";
import blurCircularRaw from "@material-symbols/svg-400/outlined/blur_circular.svg?raw";
import flagRaw from "@material-symbols/svg-400/outlined/flag.svg?raw";

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
  | "upload"
  | "palette"
  | "map"
  | "directions_car"
  | "layers"
  | "route"
  | "directions_walk"
  | "directions_bike"
  | "add"
  | "more_vert"
  | "drag_indicator"
  | "delete"
  | "edit"
  | "search"
  | "close"
  | "blur_circular"
  | "flag";

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
  palette: currentColor(paletteRaw),
  map: currentColor(mapRaw),
  directions_car: currentColor(directionsCarRaw),
  layers: currentColor(layersRaw),
  route: currentColor(routeRaw),
  directions_walk: currentColor(directionsWalkRaw),
  directions_bike: currentColor(directionsBikeRaw),
  add: currentColor(addRaw),
  more_vert: currentColor(moreVertRaw),
  drag_indicator: currentColor(dragIndicatorRaw),
  delete: currentColor(deleteRaw),
  edit: currentColor(editRaw),
  search: currentColor(searchRaw),
  close: currentColor(closeRaw),
  blur_circular: currentColor(blurCircularRaw),
  flag: currentColor(flagRaw),
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
