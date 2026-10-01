// ── Station 3D Bridge ────────────────────────────────────────────────────────
// STATION-15 (0919_WOS_Subway_Tunnel_Vision_3D_Station_Integration_v1.0.0)
//
// Same same-origin, build-once-load-as-a-script bridge pattern
// subway-member-runtime.js/radio-channel-receiver-runtime.js already
// established (see wall/index.html's own loading of this exact convention)
// -- exposes a small, focused set of canonical functions onto
// `window.SBE.StationStructure3DBridge` so wall/'s own plain-script
// Underground/Tunnel Vision integration (wall/systems/presentation/
// subway3DStationActorLayer.js) can resolve real Station Truth and project
// it, without wall/ ever reaching into MUSIC's own source tree directly
// and without MUSIC ever reaching into wall/'s own globals at module scope.
//
// Deliberately exposes ONLY plain-data functions -- `resolveKnownStationGeometry`,
// `projectStationStructure3D`, `deriveStationWorldAnchor` -- never anything
// that touches Three.js. wall/ already loads its own global `THREE` (r0.160,
// via CDN script tag); MUSIC's own `three` npm dependency (added STATION-14)
// is r0.186 -- a real, confirmed-incompatible version gap. Bridging a
// Three.js Object3D built against one module instance for a renderer built
// against the OTHER would risk real, hard-to-diagnose cross-version
// incompatibilities. Keeping this bridge plain-data-only sidesteps that
// entirely: wall/'s own layer builds its OWN Three.js scene-graph objects
// natively, against its own global THREE, from the plain projection data
// this bridge hands it -- see subway3DStationActorLayer.js's own header for
// the full reasoning.
import { resolveKnownStationGeometry } from "../logic/maps/stationGeometryRegistry";
import { projectStationStructure3D } from "../logic/maps/stationStructuralProjection3D";
import { deriveStationWorldAnchor, deriveLevelPresentationDepthM } from "../logic/maps/stationWorldTransform";

interface RootWithSBE {
  SBE?: {
    StationStructure3DBridge?: {
      resolveKnownStationGeometry: typeof resolveKnownStationGeometry;
      projectStationStructure3D: typeof projectStationStructure3D;
      deriveStationWorldAnchor: typeof deriveStationWorldAnchor;
      deriveLevelPresentationDepthM: typeof deriveLevelPresentationDepthM;
    };
  };
}

const root = window as unknown as RootWithSBE;
root.SBE = root.SBE || {};
root.SBE.StationStructure3DBridge = {
  resolveKnownStationGeometry,
  projectStationStructure3D,
  deriveStationWorldAnchor,
  deriveLevelPresentationDepthM,
};

console.log("[StationStructure3DBridge] loaded");
