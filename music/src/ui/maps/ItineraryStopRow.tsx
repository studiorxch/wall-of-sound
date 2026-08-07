import { useState } from "react";
import { Icon, type IconName } from "../Icon";
import type { ItineraryStage, LocationRef, TravelMode } from "../../data/itineraryTypes";
import { SELECTABLE_MODES, ITINERARY_UI_ENABLED_MODES, ITINERARY_UI_DISABLED_REASON } from "../../data/itineraryTypes";

// 0729E_MAPS_Itinerary_Collections_Foundation — one row of the mockup's
// ordered stop list: numbered badge + dotted connector, destination name,
// (for stops after the first) the incoming leg's mode icon + duration +
// distance, and a "⋮" overflow menu.
//
// 0805A — the mode picker now RENDERS all of SELECTABLE_MODES (Driving/
// Walking/Cycling/Flight) but only CLICKS on ITINERARY_UI_ENABLED_MODES
// (Driving) — every other option shows disabled with an explicit reason, per
// "no unsupported mode may appear selectable and then silently fail."
// transit/other stay fully absent (still schema-only, unreachable from any
// UI). ROUTABLE_MODES (itineraryTypes.ts) is untouched — old saved
// itineraries with an existing walking/cycling stage still route/read fine.

const MODE_ICON: Record<TravelMode, IconName> = {
  driving: "directions_car",
  walking: "directions_walk",
  cycling: "directions_bike",
  transit: "directions_car", // unreachable — not in SELECTABLE_MODES
  flight: "directions_car",  // rendered (0805A), disabled — no dedicated flight icon asset yet
  other: "directions_car",   // unreachable — not in SELECTABLE_MODES
};

const MODE_LABEL: Record<TravelMode, string> = {
  driving: "Driving", walking: "Walking", cycling: "Cycling",
  transit: "Transit", flight: "Flight", other: "Other",
};

function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 10 ? `${miles.toFixed(2)} mi` : `${Math.round(miles)} mi`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hr${hours === 1 ? "" : "s"}`;
}

type Props = {
  index: number;
  stop: LocationRef;
  incomingStage: ItineraryStage | null; // null for the first stop (no incoming leg)
  isLast: boolean;
  draggingIndex: number | null;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
  onChangeMode: (stageId: string, mode: TravelMode) => void;
  onRemove: (stopId: string) => void;
};

export function ItineraryStopRow({
  index, stop, incomingStage, isLast, draggingIndex,
  onDragStart, onDragOver, onDrop, onChangeMode, onRemove,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`itin-stop-row${draggingIndex === index ? " itin-stop-row--dragging" : ""}${isLast ? "" : " itin-stop-row--connected"}`}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index); }}
      onDrop={(e) => { e.preventDefault(); onDrop(index); }}
    >
      <span className="itin-stop-badge">{index + 1}</span>
      <div className="itin-stop-body">
        <span className="itin-stop-name">{stop.name}</span>
        {incomingStage && (
          <span className="itin-stop-leg">
            <Icon name={MODE_ICON[incomingStage.mode]} />
            {incomingStage.durationSeconds != null && <span>{formatDuration(incomingStage.durationSeconds)}</span>}
            {incomingStage.distanceMeters != null && <span>{formatDistance(incomingStage.distanceMeters)}</span>}
            {incomingStage.routeSetId === "" && <span className="itin-stop-leg-pending">Routing…</span>}
          </span>
        )}
      </div>
      <span className="itin-stop-menu">
        <button className="itin-stop-menu-btn" onClick={() => setMenuOpen((v) => !v)} title="More">
          <Icon name="more_vert" />
        </button>
        {menuOpen && (
          <div className="itin-stop-menu-popover" onMouseLeave={() => setMenuOpen(false)}>
            {incomingStage && (
              <>
                <div className="itin-stop-menu-label">Mode</div>
                {SELECTABLE_MODES.map((mode) => {
                  const enabled = ITINERARY_UI_ENABLED_MODES.includes(mode);
                  return (
                    <button
                      key={mode}
                      className={`ctx-item${incomingStage.mode === mode ? " ctx-item--active" : ""}${enabled ? "" : " ctx-item-disabled itin-mode-disabled"}`}
                      disabled={!enabled}
                      onClick={enabled ? () => { onChangeMode(incomingStage.id, mode); setMenuOpen(false); } : undefined}
                    >
                      <Icon name={MODE_ICON[mode]} />
                      <span className="itin-mode-label-col">
                        <span>{MODE_LABEL[mode]}</span>
                        {!enabled && <span className="itin-mode-disabled-reason">{ITINERARY_UI_DISABLED_REASON}</span>}
                      </span>
                    </button>
                  );
                })}
                <div className="ctx-sep" />
              </>
            )}
            <button className="ctx-item danger" onClick={() => { onRemove(stop.id); setMenuOpen(false); }}>
              <Icon name="delete" /> Remove Stop
            </button>
          </div>
        )}
      </span>
    </div>
  );
}
