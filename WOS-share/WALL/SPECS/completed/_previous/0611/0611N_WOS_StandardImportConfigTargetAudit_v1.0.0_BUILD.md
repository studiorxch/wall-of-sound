0611N_WOS_StandardImportConfigTargetAudit_v1.0.0_BUILD

Audit only. Do not patch.

We need to determine whether Standard basemap config writes are targeting the correct import ID and correct config keys.

Evidence:
- importsPresent = true
- imports[0].url = mapbox://styles/mapbox/standard
- visible beige buildings remain
- queryRenderedFeatures does not expose them
- setConfigProperty exists
- manual show3dBuildings/show3dFacades/show3dObjects/show3dLandmarks/showIndoor false did not remove them

Required:
1. Print exact:
   - map.getStyle().imports
   - every import.id
   - every import.config key/value
2. For each import.id, test:
   - getConfigProperty(importId, key)
   - setConfigProperty(importId, key, false)
   - getConfigProperty(importId, key)
3. Test all likely building keys:
   - show3dBuildings
   - show3dFacades
   - showBuildings
   - showBuildingModels
   - showBuildingExtrusions
   - show3dObjects
   - show3dLandmarks
   - showIndoor
4. Wait 1000ms after each set before visual/query check.
5. Report:
   - working import ID
   - keys accepted
   - keys ignored
   - keys undefined
   - whether the beige buildings visually changed
6. Classify:
   A. Wrong import ID
   B. Wrong config key
   C. Config accepted but not visually applied
   D. Imported Standard buildings not configurable
   E. Not Standard import

Do not modify replacement logic, suppression logic, registry, Studio, Canvas, or Glyph.