import { useEffect, useState } from "react";
import { MapsSidebar } from "./MapsSidebar";
import { MapsPalettesGrid } from "./MapsPalettesGrid";
import { MapsPaletteDetail } from "./MapsPaletteDetail";
import { parseMapsHash, writeMapsHash } from "../../maps/mapsHash";

// Reload-safe URL for the MAPS domain only — MUSIC itself has no router or
// URL sync (pure in-memory view state everywhere else); this is a minimal,
// additive hash scheme scoped to #maps/... so a direct reload of a MAPS
// route restores the same gallery/detail view, per spec §15.4, without
// adopting a router library or touching any other workspace mode.
export function MapsSection() {
  const [selectedId, setSelectedId] = useState<string | null>(() => parseMapsHash(window.location.hash).paletteId);

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

  return (
    <>
      <MapsSidebar onSelectGeographic={() => setSelectedId(null)} />
      <div className="workspace-right">
        <div className="workspace-main">
          {selectedId ? (
            <MapsPaletteDetail
              key={selectedId}
              paletteId={selectedId}
              onBack={() => setSelectedId(null)}
              onOpenPalette={(id) => setSelectedId(id)}
            />
          ) : (
            <MapsPalettesGrid onOpen={(id) => setSelectedId(id)} />
          )}
        </div>
      </div>
    </>
  );
}
