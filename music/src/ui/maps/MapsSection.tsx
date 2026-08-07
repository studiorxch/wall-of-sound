import { useEffect, useState } from "react";
import { MapsSidebar, type MapsLibraryKey, type MapsCollectionKey } from "./MapsSidebar";
import { MapsGeographicStylesGrid } from "./MapsGeographicStylesGrid";
import { MapsGeographicStyleDetail } from "./MapsGeographicStyleDetail";
import { MapsVehiclesCatalog } from "./MapsVehiclesCatalog";
import { MapsOverlaysCatalog } from "./MapsOverlaysCatalog";
import { MapsOrbsCatalog } from "./MapsOrbsCatalog";
import { MapsItinerariesGrid } from "./MapsItinerariesGrid";
import { MapsItineraryEditor } from "./MapsItineraryEditor";
import { MapsRaceCoursesGrid } from "./MapsRaceCoursesGrid";
import { MapsRaceCourseDetail } from "./MapsRaceCourseDetail";
import { parseMapsHash, writeMapsHash } from "../../maps/mapsHash";
import * as itineraryStore from "../../maps/itineraryStore";
import * as raceCourseStore from "../../maps/raceCourseStore";

// Reload-safe URL for the MAPS domain only — MUSIC itself has no router or
// URL sync (pure in-memory view state everywhere else); this is a minimal,
// additive hash scheme scoped to #maps/... so a direct reload of a MAPS
// route restores the same gallery/detail view, per spec §15.4, without
// adopting a router library or touching any other workspace mode.
//
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation — adds a second library
// (Vehicles) alongside Geographic. Library selection itself is in-memory
// only (not part of the hash scheme) — the hash continues to track only
// which Geographic Style is open, exactly as before this build.
//
// 0729E_MAPS_Itinerary_Collections_Foundation — adds a COLLECTIONS branch
// (Itineraries), mutually exclusive with the LIBRARIES branch. Itinerary
// selection is in-memory only, same as library selection — no hash routing
// added for it.
export function MapsSection() {
  const [activeLibrary, setActiveLibrary] = useState<MapsLibraryKey>("geographic");
  const [activeCollection, setActiveCollection] = useState<MapsCollectionKey | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => parseMapsHash(window.location.hash).paletteId);
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(null);
  const [selectedRaceCourseId, setSelectedRaceCourseId] = useState<string | null>(null);

  useEffect(() => {
    writeMapsHash(selectedId);
  }, [selectedId]);

  useEffect(() => {
    function onHashChange() {
      setSelectedId(parseMapsHash(window.location.hash).paletteId);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function selectLibrary(library: MapsLibraryKey) {
    setActiveCollection(null);
    setActiveLibrary(library);
  }

  // Refines App.tsx's coarse "MAPS" title with a library/item-specific
  // suffix. Only ever runs while MapsSection is mounted (i.e. workspaceMode
  // === "maps") — App.tsx's own effect resets to "MUSIC" the moment
  // workspaceMode changes, which is the only way this component unmounts, so
  // no cleanup/reset effect is needed here.
  useEffect(() => {
    let label = "MAPS";
    if (activeCollection === "itineraries") {
      if (selectedItineraryId) {
        const it = itineraryStore.getItinerary(selectedItineraryId);
        label = it ? `MAPS — ${it.title}` : "MAPS — Itinerary";
      } else {
        label = "MAPS — Itineraries";
      }
    } else if (activeLibrary === "raceCourses") {
      if (selectedRaceCourseId) {
        const c = raceCourseStore.getRaceCourse(selectedRaceCourseId);
        label = c ? `MAPS — ${c.name}` : "MAPS — Race Course";
      } else {
        label = "MAPS — Race Courses";
      }
    } else if (activeLibrary === "vehicles") {
      label = "MAPS — Vehicles";
    } else if (activeLibrary === "overlays") {
      label = "MAPS — Overlays";
    } else if (activeLibrary === "orbs") {
      label = "MAPS — Orbs";
    } else if (selectedId) {
      label = "MAPS — Geographic";
    }
    document.title = label;
  }, [activeLibrary, activeCollection, selectedItineraryId, selectedRaceCourseId, selectedId]);

  return (
    <>
      <MapsSidebar
        activeLibrary={activeLibrary}
        onSelectLibrary={selectLibrary}
        activeCollection={activeCollection}
        onSelectCollection={setActiveCollection}
      />
      <div className="workspace-right">
        <div className="workspace-main">
          {activeCollection === "itineraries" ? (
            selectedItineraryId ? (
              <MapsItineraryEditor
                key={selectedItineraryId}
                itineraryId={selectedItineraryId}
                onBack={() => setSelectedItineraryId(null)}
              />
            ) : (
              <MapsItinerariesGrid onOpen={(id) => setSelectedItineraryId(id)} />
            )
          ) : activeLibrary === "vehicles" ? (
            <MapsVehiclesCatalog />
          ) : activeLibrary === "overlays" ? (
            <MapsOverlaysCatalog />
          ) : activeLibrary === "orbs" ? (
            <MapsOrbsCatalog />
          ) : activeLibrary === "raceCourses" ? (
            selectedRaceCourseId ? (
              <MapsRaceCourseDetail
                key={selectedRaceCourseId}
                courseId={selectedRaceCourseId}
                onBack={() => setSelectedRaceCourseId(null)}
              />
            ) : (
              <MapsRaceCoursesGrid onOpen={(id) => setSelectedRaceCourseId(id)} />
            )
          ) : selectedId ? (
            <MapsGeographicStyleDetail
              key={selectedId}
              styleId={selectedId}
              onBack={() => setSelectedId(null)}
              onOpenStyle={(id) => setSelectedId(id)}
            />
          ) : (
            <MapsGeographicStylesGrid onOpen={(id) => setSelectedId(id)} />
          )}
        </div>
      </div>
    </>
  );
}
