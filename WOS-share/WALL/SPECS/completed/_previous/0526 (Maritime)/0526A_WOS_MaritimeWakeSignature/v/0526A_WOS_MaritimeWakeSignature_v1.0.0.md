# 0526A_WOS_MaritimeWakeSignature_v1.0.0

Status: [BUILD]

Purpose:
Define vessel-class wake identity as a presentation-layer maritime motion readability system for WOS.

Core Doctrine:
- Wake signatures communicate vessel character.
- Wake systems are presentation interpretation, not simulation truth.
- Wakes should feel atmospheric, restrained, and class-distinct.

Canonical Wake Modes:
- LINEAR
- SPLIT_V
- TURBULENT
- DRIFT
- DISCIPLINED

Target Vessel Identities:
- Cargo → heavy inertia
- Tanker → broad displacement
- Ferry → energetic corridor movement
- Tug → aggressive turbulence
- Recreational → playful slicing
- Fishing → unstable drift
- Passenger → smooth glide
- Military → restrained discipline
- Industrial → mechanical churn

Renderer Integration:
AISRuntime
→ ProceduralVesselTopology
→ MaritimeWakeSignature
→ MaritimeOccupancyRenderer

Implementation Files:
- wall/systems/presentation/maritimeWakeSignature.js

Recommended Runtime Flags:
- showMaritimeWakeSignatures
- showMaritimeWakeDebug
- showMaritimeWakeGlow
- showMaritimeWakeTurbulence

Final Doctrine:
A wake is not water simulation.
A wake is memory of movement.
