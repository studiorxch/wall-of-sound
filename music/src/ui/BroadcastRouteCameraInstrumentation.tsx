import { getSkyParams } from "../runtime/skyAtmosphereModel";
import type { SyncState } from "../runtime/broadcastIndicatorRegistry";

// Route camera + sky/atmosphere instrumentation panel.
//
// Camera state audit (traversalControlDeck.js):
//   speedIndex: 0–10 via TRAVERSAL_SPEED_STEPS [0.05, 0.10, 0.25, 0.5, 1, 2, 5, 10, 20, 40, 80]
//   altitudeIndex: levels — drone(25ft), low_drone(50ft), urban(100ft), rooftop(250ft),
//                            ground(500ft), low(1500ft), city(5000ft), regional(12000ft), cruise(35000ft)
//   transport: drive | flight | walk | bike | transit
//   Camera modes exposed via SBE.CameraShotSelectorUI.setShot(id):
//     ext_follow   — Ext. Rear (Follow)
//     int_driver   — Int. Driver POV
//     int_passenger — Int. Passenger POV
//     dashcam / helmetcam / bus_window / ferry_deck / drone_observer (shot presets)
//   Default: ext_follow
//
// POV bridge: PLAY sends postMessage({type:'play:set-camera-mode', mode}) to WOS iframe.
//   WOS listener added in wall/index.html calls SBE.CameraShotSelectorUI.setShot(mode).
//   All values are cross-origin (WOS iframe); postMessage is the only safe channel.
//
// Sky model: see skyAtmosphereModel.ts.
//   renderer: "sky-bridge" — THREE CANVAS BLOCKED. Integration requires WOS-side
//   threeSkyLayer.js as a Mapbox CustomLayerInterface using global.THREE (CDN-loaded).

// Camera POV modes wired via postMessage bridge
export const CAM_POV_MODES = [
  { id: "ext_follow",    label: "EXT" },
  { id: "int_driver",   label: "DRIVER" },
  { id: "int_passenger", label: "PASS" },
] as const;

export type CamPovModeId = typeof CAM_POV_MODES[number]["id"];

type Props = {
  controlsVisible: boolean;
  hourOfDay: number;
  // Optional overrides from postMessage bridge / WOS state
  speedMult?: number;
  altitudeLabel?: string;
  transport?: string;
  routeState?: string;
  // POV control bridge
  activeCamMode?: CamPovModeId;
  onCameraMode?: (mode: CamPovModeId) => void;
  // Sky renderer override — set by wall:sky-status postMessage from WALL ThreeSkyLayer
  skyRenderer?: "sky-bridge" | "three-sky" | "unavailable";
  skyRendererBlockReason?: string;
  // WALL sync state — for sky visibility status
  syncState?: SyncState;
};

function fmt2(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export function BroadcastRouteCameraInstrumentation({
  controlsVisible,
  hourOfDay,
  speedMult = 1,
  altitudeLabel = "CITY",
  transport = "DRIVE",
  routeState = "LIVE",
  activeCamMode = "ext_follow",
  onCameraMode,
  skyRenderer,
  skyRendererBlockReason,
  syncState,
}: Props) {
  if (!controlsVisible) return null;

  const sky = getSkyParams(hourOfDay);
  const tMode = transport.toUpperCase();
  const camMode = tMode === "FLIGHT" ? "AERIAL" : "ROUTE";

  // ATM status: prefer prop override (from WALL wall:sky-status postMessage) over model default
  const effectiveRenderer = skyRenderer ?? sky.renderer;
  const effectiveBlock = skyRendererBlockReason ?? sky.rendererBlockReason;
  const atmLabel =
    effectiveRenderer === "three-sky"
      ? "THREE SKY"
      : effectiveRenderer === "unavailable"
      ? `UNAVAILABLE — ${effectiveBlock ?? "unknown"}`
      : `SKY BRIDGE — THREE CANVAS BLOCKED`;

  // Sky visibility status — explains why sky may not be visible in the map view
  const skyVisLabel =
    !syncState || syncState === "missing"
      ? "NO WALL"
      : effectiveRenderer !== "three-sky"
      ? "BLOCKED"
      : (hourOfDay >= 20 || hourOfDay < 5)
      ? "LOW — NIGHT"
      : "HORIZON";

  const skyRows: { label: string; value: string; dim?: boolean }[] = [
    { label: "SKY",   value: sky.phaseLabel },
    { label: "SUN",   value: `EL ${sky.sunElevation}° / AZ ${sky.sunAzimuth}°` },
    { label: "CLOUD", value: `${Math.round(sky.cloudCoverage * 100)}% / D ${sky.cloudDensity.toFixed(2)}` },
    { label: "ATM",   value: atmLabel, dim: effectiveRenderer !== "three-sky" },
    { label: "VIS",   value: skyVisLabel, dim: skyVisLabel !== "HORIZON" },
  ];

  return (
    <div className="brci-panel">
      {/* Camera mode row */}
      <div className="brci-row">
        <span className="brci-label">CAM</span>
        <span className="brci-value">{camMode}</span>
      </div>

      {/* POV controls — compact buttons if bridge wired, plain label otherwise */}
      <div className="brci-row brci-row--pov">
        <span className="brci-label">POV</span>
        {onCameraMode ? (
          <span className="brci-pov-btns">
            {CAM_POV_MODES.map((m) => (
              <button
                key={m.id}
                className={`brci-cam-btn${activeCamMode === m.id ? " brci-cam-btn--active" : ""}`}
                onClick={() => onCameraMode(m.id)}
                title={m.id.replace(/_/g, " ")}
              >
                {m.label}
              </button>
            ))}
          </span>
        ) : (
          <span className="brci-value brci-value--dim">CTRL UNWIRED</span>
        )}
      </div>

      <div className="brci-row">
        <span className="brci-label">SPD</span>
        <span className="brci-value">{fmt2(speedMult)}X</span>
      </div>
      <div className="brci-row">
        <span className="brci-label">ALT</span>
        <span className="brci-value">{altitudeLabel}</span>
      </div>
      <div className="brci-row">
        <span className="brci-label">ROUTE</span>
        <span className="brci-value">{routeState}</span>
      </div>

      <div className="brci-sep" />

      {skyRows.map(({ label, value, dim }) => (
        <div key={label} className="brci-row">
          <span className="brci-label">{label}</span>
          <span className={`brci-value${dim ? " brci-value--dim" : ""}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}
