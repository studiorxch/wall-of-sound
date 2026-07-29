// Reload-safe URL scheme for the MAPS domain only — see MapsSection.tsx.
// Kept in its own module (not alongside the component) so Fast Refresh
// still works for MapsSection.tsx.

export function parseMapsHash(hash: string): { paletteId: string | null } {
  const m = /^#maps\/palettes\/(.+)$/.exec(hash);
  return { paletteId: m ? decodeURIComponent(m[1]) : null };
}

export function writeMapsHash(paletteId: string | null) {
  const next = paletteId ? `#maps/palettes/${encodeURIComponent(paletteId)}` : "#maps";
  if (window.location.hash !== next) window.history.replaceState(null, "", next);
}
