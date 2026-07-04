# WALL Completion Report
## 0627F — OrbitalLegacyPathQuarantine

**Status:** PASS
**Date:** 2026-06-27
**Build type:** WALL Runtime — Orbital Earth Recovery

---

## Summary

Quarantined all known legacy orbital visual submodes so they cannot reach the default Orbital Earth entry path. Added `_KNOWN_LEGACY_SUBMODES` list to `OrbitalModeController.js`. Inserted a guard in the Orbital dispatch so `"earth"` submode only runs Mapbox-first `OrbitalEarthMode` — it does not call `_buildScene()` or `_applyPreset()`. Legacy visualizer routes (portal_orb, deep_space_listen, minimal_dark_sphere, fake sphere) are now manual-only. Added `getLegacyPathReport()` to `SBE.OrbitalModeController`. CSS scope from 0627E (`body.wos-orbital-active:not(.wos-orbital-earth-active)`) confirmed as the dimming isolation boundary.

---

## Key Deliverables

| Deliverable | Detail |
|---|---|
| `_KNOWN_LEGACY_SUBMODES` | Internal list of legacy submode identifiers |
| Guard in orbital dispatch | `if (submode === "earth") { /* Mapbox-first only — no _buildScene(), no _applyPreset() */ }` |
| `[WOS Orbital] LEGACY PATH BLOCKED` log | Logged when a legacy entry is attempted via the default route |
| `[WOS Orbital] LEGACY VISUALIZER ENTERED` log | Logged if a legacy submode is entered via the explicit manual path |
| `SBE.OrbitalModeController.getLegacyPathReport()` | Returns quarantine state, known legacy submodes, last blocked attempt, CSS guard active flag |

---

## `_KNOWN_LEGACY_SUBMODES`

```js
[
  "portal_orb",
  "deep_space_listen",
  "minimal_dark_sphere",
  "three_fake_sphere"
]
```

None of these can be reached by normal Orbital Earth entry. All require explicit manual dispatch.

---

## Guard Logic (simplified)

```js
// In OrbitalModeController dispatch:
if (submode === "earth") {
  // Mapbox-first only. Do not call _buildScene() or _applyPreset().
  return OrbitalEarthMode.enter();
}
if (_KNOWN_LEGACY_SUBMODES.includes(submode)) {
  if (!ctx?.manualOverride) {
    log('[WOS Orbital] LEGACY PATH BLOCKED', { submode });
    return;
  }
  log('[WOS Orbital] LEGACY VISUALIZER ENTERED', { submode });
}
```

---

## CSS Isolation Boundary (from 0627E)

`body.wos-orbital-active:not(.wos-orbital-earth-active)` — legacy dimming only fires in non-Earth orbital modes. Confirmed still active.

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalModeController.js` | Added `_KNOWN_LEGACY_SUBMODES`, entry guard, `getLegacyPathReport()` |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| `_KNOWN_LEGACY_SUBMODES` list defined | PASS |
| Guard prevents `_buildScene()` / `_applyPreset()` in earth submode | PASS |
| `LEGACY PATH BLOCKED` log fires on blocked attempt | PASS |
| `LEGACY VISUALIZER ENTERED` log fires on manual legacy entry | PASS |
| `getLegacyPathReport()` exists on `SBE.OrbitalModeController` | PASS |
| CSS scope guard from 0627E confirmed active | PASS |
| No new visual features | PASS |
| No Moon expansion | PASS |
| No presentation controls | PASS |

---

## Do Not Reopen

- Do not remove `_KNOWN_LEGACY_SUBMODES`. Any new orbital submode must be explicitly placed here or in the earth route — no silent fallthrough.
- Do not call `_buildScene()` or `_applyPreset()` from the earth submode dispatch path under any circumstances.
- Legacy submodes (portal_orb, deep_space_listen, minimal_dark_sphere, fake sphere) must remain manual-only permanently.

---

## Next Step

0627G — OrbitalMapTransitionCleanup: verify and fix the Map → Orbital → Map round trip for stuck classes, overlays, filters, and camera state.
