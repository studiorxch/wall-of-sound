0611I_WOS_DebugBindingReliabilityPatch_v1.0.0_BUILD

Fix debug binding reliability for BuildingEditProjectionRuntime.

Problem:
_wos.debug.buildingEdits.verifySuppression() can fail because _wos.debug.buildingEdits is null even though SBE.BuildingEditProjectionRuntime exists.

Required:
1. Ensure window._wos and window._wos.debug are created if missing.
2. Always bind:
   window._wos.debug.buildingEdits = SBE.BuildingEditProjectionRuntime
3. Add global shortcut:
   window.verifyWallSuppression = SBE.BuildingEditProjectionRuntime.verifySuppression
4. Do not change suppression logic.
5. Do not mutate map state.

Acceptance:
- _wos.debug.buildingEdits.verifySuppression() works.
- SBE.BuildingEditProjectionRuntime.verifySuppression() still works.
- window.verifyWallSuppression() works.