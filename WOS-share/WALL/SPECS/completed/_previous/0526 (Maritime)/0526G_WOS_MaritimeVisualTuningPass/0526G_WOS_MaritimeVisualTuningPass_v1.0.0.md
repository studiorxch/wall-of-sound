# 0526G_WOS_MaritimeVisualTuningPass_v1.0.0

## Goal

Apply a fast maritime visual tuning pass after 0526E/0526F.

Do NOT add new systems.

Patch existing renderer/light behavior only.

## Scope

Patch:

- `wall/render/maritimeOccupancyRenderer.js`
- `wall/systems/presentation/maritimeLightAuthority.js` only if needed

## Required Changes

### 1. Reduce hull authority at distance

In `maritimeOccupancyRenderer.js`, after distance/light envelopes resolve, apply additional vessel/body alpha reduction for non-validation vessels:

- FAR: hull/topology alpha × 0.70
- ATMOSPHERIC: hull/topology alpha × 0.35
- LIGHT_ONLY: hull/topology alpha = 0

Do not reduce far light alpha.

Validation vessels bypass this.

### 2. Let lights read before hulls

For FAR and ATMOSPHERIC bands:

- suppress detailed sprite rendering
- prefer marker/light presentation
- preserve `allowFarGlint`

Do not mutate AIS/runtime state.

### 3. Soften far bloom

In `MaritimeLightAuthority`, reduce overly clean far bloom:

- FAR bloomAlpha × 0.85
- ATMOSPHERIC bloomAlpha × 0.65
- keep `MAX_BLOOM_ALPHA` unchanged

### 4. Add tiny deterministic atmospheric drift

Add a very slow seeded alpha drift to light envelopes:

```js
var drift = 0.92 + 0.08 * Math.sin(nowMs * 0.00008 + seedFrac * Math.PI * 2);
modulatedAlpha *= drift;