import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import * as wallGeographicStyleBridge from "../../maps/wallGeographicStyleBridge";
import * as wallVehicleStyleBridge from "../../maps/wallVehicleStyleBridge";
import * as wallOverlayStyleBridge from "../../maps/wallOverlayStyleBridge";
import * as wallOrbProfileBridge from "../../maps/wallOrbProfileBridge";
import * as itineraryStore from "../../maps/itineraryStore";
import * as raceCourseStore from "../../maps/raceCourseStore";
import { ensurePreviewMap } from "../../maps/wallMapPreview";

// Left nav column for the MAPS domain — reuses MUSIC's real .file-manager/
// .fm-* classes verbatim (0722_MUSIC_Left_Panel_Visual_Normalization) so
// width, spacing, typography, selected-row treatment, collapse behavior, and
// divider structure match exactly, rather than a parallel implementation
// that could drift.
//
// 0729_MAPS_Geographic_Library_Migration — "Palettes"/"Collections" renamed
// to "Geographic"/"Libraries": Default and Episode 2 are Geographic Style
// records now, not palettes-as-a-collection. Same underlying records/IDs/
// data — Wall's mapsGeographicStyleAuthority.js etc. are untouched; this is
// a user-facing terminology change only.
//
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation — data-driven list of
// library rows. Geographic always shows (Default always exists). Vehicles/
// Overlays show only once a real record exists — no zero-count placeholder
// row, per spec. In MUSIC's centralized Library, Overlays shows 2 of its 4
// real records (Atmosphere Composite, Environmental Telemetry HUD) since
// Now Playing HUD/Flight Data HUD's own source modules are deliberately not
// loaded there (see overlayStyleRegistry.js) — the count reflects that
// honestly rather than a fixed "4".
//
// 0729E_MAPS_Itinerary_Collections_Foundation — adds a COLLECTIONS section
// below LIBRARIES. Unlike Vehicles/Overlays, the Itineraries row is ALWAYS
// visible (not gated on a real-record count): there is no pre-existing real
// object to migrate in the way Hero Car or Atmosphere Composite were, so the
// row itself must be the "create the first one" entry point — matching how
// MUSIC's own Playlists section is always visible, count 0 included.
// activeLibrary/activeCollection are mutually exclusive selection states —
// only one row is ever highlighted at a time.

export type MapsLibraryKey = "geographic" | "vehicles" | "overlays" | "orbs" | "raceCourses";
export type MapsCollectionKey = "itineraries";

type Props = {
  activeLibrary: MapsLibraryKey;
  onSelectLibrary: (library: MapsLibraryKey) => void;
  activeCollection: MapsCollectionKey | null;
  onSelectCollection: (collection: MapsCollectionKey) => void;
};

function readGeographicCount(): number {
  const list = wallGeographicStyleBridge.listGeographicStyles();
  return list.ok ? list.data.length : 0;
}

function readVehicleCount(): number {
  const list = wallVehicleStyleBridge.listVehicles();
  return list.ok ? list.data.length : 0;
}

function readOverlayCount(): number {
  const list = wallOverlayStyleBridge.listOverlays();
  return list.ok ? list.data.length : 0;
}

function readOrbCount(): number {
  const list = wallOrbProfileBridge.listOrbProfiles();
  return list.ok ? list.data.length : 0;
}

function readRaceCourseCount(): number {
  return raceCourseStore.listRaceCourses().length;
}

export function MapsSidebar({ activeLibrary, onSelectLibrary, activeCollection, onSelectCollection }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [geographicCount, setGeographicCount] = useState(readGeographicCount);
  const [vehicleCount, setVehicleCount] = useState(readVehicleCount);
  const [overlayCount, setOverlayCount] = useState(readOverlayCount);
  const [orbCount, setOrbCount] = useState(readOrbCount);
  const [raceCourseCount, setRaceCourseCount] = useState(readRaceCourseCount);
  const [itineraryCount, setItineraryCount] = useState(() => itineraryStore.listItineraries().length);

  useEffect(() => {
    // authority.init() itself doesn't call subscribe()'s notify — only later
    // mutations (activate/preview/etc.) do — so on first mount, before any
    // mutation has ever happened, the count would otherwise stay at its
    // initial (possibly zero, if the map hadn't finished loading yet) value
    // forever. ensurePreviewMap's ready callback is what actually signals
    // "the authority just initialized," same trigger MapsGeographicStylesGrid uses.
    if (!wallGeographicStyleBridge.isAuthorityInitialized()) ensurePreviewMap(() => setGeographicCount(readGeographicCount()));
    const unsubGeographic = wallGeographicStyleBridge.subscribe(() => setGeographicCount(readGeographicCount()));
    // Vehicles/Overlays have no map dependency — their authorities self-init
    // at script load, so the useState lazy initializers above are already
    // accurate by first render; only later mutations need a subscription.
    const unsubVehicles = wallVehicleStyleBridge.subscribe(() => setVehicleCount(readVehicleCount()));
    const unsubOverlays = wallOverlayStyleBridge.subscribe(() => setOverlayCount(readOverlayCount()));
    const unsubOrbs = wallOrbProfileBridge.subscribe(() => setOrbCount(readOrbCount()));
    // raceCourseStore hydrates async from its own IndexedDB — same
    // "count may start at 0 and update shortly after" shape as itineraries.
    const unsubRaceCourses = raceCourseStore.subscribe(() => setRaceCourseCount(readRaceCourseCount()));
    // itineraryStore hydrates async from IndexedDB — its own subscribe
    // fires once hydration completes, same "count may start at 0 and
    // update shortly after" shape as the wall bridges above.
    const unsubItineraries = itineraryStore.subscribe(() => setItineraryCount(itineraryStore.listItineraries().length));
    return () => { unsubGeographic(); unsubVehicles(); unsubOverlays(); unsubOrbs(); unsubRaceCourses(); unsubItineraries(); };
  }, []);

  return (
    <nav className={`file-manager${collapsed ? " fm-collapsed" : ""}`}>
      <button
        className="fm-toggle"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand" : "Collapse"}
      >
        <Icon name={collapsed ? "chevron_right" : "chevron_left"} />
      </button>

      {!collapsed && (
        <div className="fm-body">
          <div className="fm-brand">MAPS</div>
          <div className="fm-section">
            <div className="fm-section-header">Libraries</div>
            <button
              className={`fm-row${activeCollection === null && activeLibrary === "geographic" ? " active" : ""}`}
              onClick={() => onSelectLibrary("geographic")}
            >
              <span className="fm-row-icon"><Icon name="map" /></span>
              <span className="fm-row-label">Geographic</span>
              <span className="fm-row-count">{geographicCount}</span>
            </button>
            {vehicleCount > 0 && (
              <button
                className={`fm-row${activeCollection === null && activeLibrary === "vehicles" ? " active" : ""}`}
                onClick={() => onSelectLibrary("vehicles")}
              >
                <span className="fm-row-icon"><Icon name="directions_car" /></span>
                <span className="fm-row-label">Vehicles</span>
                <span className="fm-row-count">{vehicleCount}</span>
              </button>
            )}
            {overlayCount > 0 && (
              <button
                className={`fm-row${activeCollection === null && activeLibrary === "overlays" ? " active" : ""}`}
                onClick={() => onSelectLibrary("overlays")}
              >
                <span className="fm-row-icon"><Icon name="layers" /></span>
                <span className="fm-row-label">Overlays</span>
                <span className="fm-row-count">{overlayCount}</span>
              </button>
            )}
            {orbCount > 0 && (
              <button
                className={`fm-row${activeCollection === null && activeLibrary === "orbs" ? " active" : ""}`}
                onClick={() => onSelectLibrary("orbs")}
              >
                <span className="fm-row-icon"><Icon name="blur_circular" /></span>
                <span className="fm-row-label">Orbs</span>
                <span className="fm-row-count">{orbCount}</span>
              </button>
            )}
            {raceCourseCount > 0 && (
              <button
                className={`fm-row${activeCollection === null && activeLibrary === "raceCourses" ? " active" : ""}`}
                onClick={() => onSelectLibrary("raceCourses")}
              >
                <span className="fm-row-icon"><Icon name="flag" /></span>
                <span className="fm-row-label">Race Courses</span>
                <span className="fm-row-count">{raceCourseCount}</span>
              </button>
            )}
          </div>
          <div className="fm-section">
            <div className="fm-section-header">Collections</div>
            <button
              className={`fm-row${activeCollection === "itineraries" ? " active" : ""}`}
              onClick={() => onSelectCollection("itineraries")}
            >
              <span className="fm-row-icon"><Icon name="route" /></span>
              <span className="fm-row-label">Itineraries</span>
              <span className="fm-row-count">{itineraryCount}</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
