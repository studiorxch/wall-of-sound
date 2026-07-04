**0602D_WOS_HeroRuntimeWorldLayerAutoEnable_v1.0.0_BUILD**

Patch goal: when Drive/HeroVehicleRuntime becomes active, WorldSpaceVehicleLayer must auto-start and enable exactly once, without changing render math, depth, heading, traffic, camera, or route logic.

Core fix:

- In the Drive launch path or HeroVehicleRenderer startup path, call:

```
SBE.WorldSpaceVehicleLayer.start();SBE.WorldSpaceVehicleLayer.setEnabled(true);
```

before the first hero `upsertVehicle()`.

Acceptance:

- After Launch Drive:
    - `enableAudit().enabled === true`
    - `enableHistory().enableCount >= 1`
    - `renderAudit().lastEarlyReturnReason !== 'layer_disabled'`
    - `state().vehicleCount >= 1`
    - hero visible without calling `liveHero()` manually.