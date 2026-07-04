# 0525D_WOS_SurfaceStylePresets_v1.0.0

Stage: [BUILD]
Freeze Decision: GO

Purpose:
Define immutable atmospheric presentation presets layered between MapStyleAuthority and LiveStylePanel.

Core Doctrine:
Presets describe presentation identity.
They do NOT create simulation truth.

Canonical Precedence:
Base Registry
→ Surface Preset
→ Live Override

Required Runtime:
wall/systems/presentation/surfaceStylePresetRuntime.js

Required Debug:
wall/systems/presentation/surfaceStylePresetDebug.js

Required Public API:
- registerPreset()
- getPreset()
- getAllPresets()
- setActivePreset()
- clearActivePreset()
- getActivePreset()
- resolvePresentationManifest()

Preset Categories:
- QUIET_HARBOR
- MIDNIGHT_FREIGHT
- SIGNAL_DRIFT
- BROADCAST_FAILURE

Constitutional Summary:
MapStyleAuthority owns presentation truth.
SurfaceStylePresetRuntime owns atmospheric identity.
LiveStylePanel owns temporary tuning.
MarineRenderer owns interpretation.
Simulation systems own truth.
