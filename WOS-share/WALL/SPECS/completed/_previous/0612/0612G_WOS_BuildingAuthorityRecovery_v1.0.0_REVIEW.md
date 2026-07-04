# 0612G_WOS_BuildingAuthorityRecovery_v1.0.0_REVIEW

Recovery review of the 0611–0612 Building Authority effort.
Reviewed against current source state, 2026-06-12 (rev 2 — corrected file set
including Studio Map Lab modules).
Review only. No fixes proposed. No new specs.

---

## 0. Load-state facts (verified against source)

These facts anchor every status below:

- `wall/index.html` loads (in order): `runtimes/mapboxViewportRuntime.js`,
  `buildingEditProjectionRuntime.js`, `buildingReplacementRuntime.js`,
  `buildingStyleKit.js`, `selectedBuildingsOnlyMode.js`,
  `editableBasemapAuthority.js`, `threeViewStyleParityLock.js`.
- `wall/index.html` does **NOT** load `buildingAuthorityRuntime.js` (0612A)
  or `buildingReplacementMinimumVisibleResult.js` (0612B). Both exist on disk
  and are dead code — they can never run.
- `studio/index.html` loads: `mapboxAdapter.js`, `mapSelection.js`,
  `mapInspector.js` (implied by load-order comment), `buildingEditRegistry.js`,
  `../wall/systems/runtime/buildingStyleKit.js`, `buildingPreviewRuntime.js`,
  `mapLabView.js`, and `../wall/systems/presentation/threeViewStyleParityLock.js`.
- `mapboxViewportRuntime.js` lives at `wall/runtimes/`, not
  `wall/systems/presentation/` as listed in the review request.
- `buildingEditProjectionRuntime.js` is 5,206 lines at v1.18.0, carrying
  20 prior spec IDs (0610F → 0611U) as in-file accretion.
- Studio's default basemap is dark-v11 (`STYLE_OPERATOR`); Wall's broadcast
  style carries the Mapbox Standard import. This asymmetry is load-bearing
  for the root-cause analysis (Section 6).

---

## 1. Authorities found in source

### Studio (Map Lab)

```yaml
name: Building Edit Registry (Manifest Data Authority)
purpose: Persist building edits (color, hidden, replacement, geometry, groups, compounds) to localStorage manifest wos.maplab.buildings; sole manifest writer
file: studio/mapLab/buildingEditRegistry.js (v1.7.0)
introducedBy: 0609U; current head 0612C_WOS_ExistingReplacementRuntimeSyncRepair
visibleResult: Edits authored in Studio appear in Wall via storage sync; hide/replace/group/compound state round-trips (verified across the 0610 track)
status: PASS
keep: yes
reason: Single data-truth owner for the manifest. No competing writer exists. Stable across the whole effort.
replacedBy: n/a
```

```yaml
name: Mapbox Adapter (Studio Map Authority + Author Suppression Authority)
purpose: Owns the Studio map instance, style switching (dark/wos), building layer discovery, selection/hover paint, and Author-mode hidden-source suppression (height/base=0 match expressions; footprint/group/compound-aware)
file: studio/mapLab/mapboxAdapter.js (v1.13.2)
introducedBy: 0609U baseline; suppression head 0610Q; patches 0611B/0611C/0611D
visibleResult: Hidden source buildings disappear in Studio Author mode (0610P/Q, recorded as immediate visual behavior). The 0611B/C/D patch chain is the effort's verified knowledge source — fill-extrusion-opacity not data-driven, color-alpha renders black, height/base=0 works.
status: PASS
keep: yes
reason: Works on dark-v11, and produced the only rigorously verified suppression mechanism of the effort (later adopted by Wall in 0611G). However it is a SECOND, independent implementation of suppression (see Section 2).
replacedBy: n/a
```

```yaml
name: Building Preview Runtime (Preview Parity Authority)
purpose: Render Wall-identical replacement actors inside Studio (wos-preview-replacements / wos-preview-layer); Author/Preview mode switch; suppress originals in Preview
file: studio/mapLab/buildingPreviewRuntime.js (v1.5.0)
introducedBy: 0610G_WOS_ReplacementStudioWallParity; current head 0611G
visibleResult: Preview actors render with Wall geometry/materials (0610G parity track)
status: PASS
keep: yes
reason: Working preview path. Carries declared intentional copies of ARCHETYPE_CFG / ARCHETYPE_MATERIALS / geometry helpers from buildingReplacementRuntime.js with a "must be kept in sync" comment — a standing drift hazard, not a current failure.
replacedBy: n/a
```

```yaml
name: Map Inspector (Authoring UI)
purpose: Display-only inspector panel — selection, edit, replacement, group, compound, hide/restore controls; Author Cue section makes explicit that Author mode does not mutate source paint
file: studio/mapLab/mapInspector.js (v1.9.0)
introducedBy: 0609U baseline; current head 0610O
visibleResult: UI renders and drives verified edit flows (hide, replace, group, compound, delete)
status: PASS
keep: yes
reason: Pure UI; no map or data authority claimed. Stable through the effort.
replacedBy: n/a
```

```yaml
name: Map Lab View (Studio Coordinator)
purpose: Wires adapter + selection + inspector + registry + preview runtime; routes replacement changes by hierarchy (compound > group > standalone); mode bar; geometry capture on selection
file: studio/mapLab/mapLabView.js (v1.16.0)
introducedBy: 0609U baseline; current head 0610Q
visibleResult: Author-mode suppression and preview-mode rendering both reach the screen through this coordinator (verified 0610 track)
status: PASS
keep: yes
reason: The working integration layer on the Studio side. Owns no map state itself.
replacedBy: n/a
```

### Wall

```yaml
name: Building Replacement Runtime (Replacement Authority)
purpose: Render WOS replacement actors (wos-replacement-markers / wos-replacement-layer) from the manifest; archetype geometry via BuildingStyleKit, materials, footprint metrics, layer dominance
file: wall/systems/runtime/buildingReplacementRuntime.js (v1.9.1)
introducedBy: 0609U/0610E; current head 0612C
visibleResult: Replacement appeared (archetype prisms render — the long-lived verified visible result of the effort)
status: PASS
keep: yes
reason: The only loaded, working Wall replacement renderer. 0612C sync repair is its current head; it is wired into every convergence chain (0612D, 0612E).
replacedBy: n/a
```

```yaml
name: Building Edit Projection Runtime (Projection Authority + Wall Suppression Authority)
purpose: Project manifest edits onto Wall Mapbox layers — color overrides, per-feature suppression (height/base=0, opacity match), 4-phase footprint ID expansion
file: wall/systems/presentation/buildingEditProjectionRuntime.js (v1.18.0, 5,206 lines)
introducedBy: 0609U baseline; accreted through 0610F–0610N, 0611G–0611U
visibleResult: PARTIAL — old building disappeared on fill-extrusion (classic-style) layers; suppression of Mapbox Standard 'model' buildings NEVER produced a visible result (its own _discoverLayers records MODEL_LAYER_LIMITATION)
status: PARTIAL_PASS
keep: yes (core only)
reason: Core projection/suppression works on dark-v11 (the now-canonical editable basemap). It also carries embedded subsystems that are obsolete or duplicated (listed separately below).
replacedBy: n/a (core); 0611-era subsystems replaced by 0612E
```

```yaml
name: Host Building Layer Authority (0611Q, embedded in projection runtime)
purpose: Add WOS-owned fill-extrusion layer wos-host-buildings-3d as a suppressible building substrate while the Standard import is active
file: wall/systems/presentation/buildingEditProjectionRuntime.js (_ensureHostBuildingLayer, _discoverHostSource)
introducedBy: 0611Q_WOS_HostOwnedBuildingLayerAuthority
visibleResult: None recorded as verified — workaround for the Standard model-layer limitation, made unnecessary by the 0612E pivot
status: OBSOLETE
keep: no
reason: Under dark-v11 the composite building layer is directly suppressible; a parallel host layer is unnecessary. Also duplicated by 0612A with a DIFFERENT layer ID.
replacedBy: editableBasemapAuthority (0612E)
```

```yaml
name: Building Authority Mode + Editable Bypass + Visual Isolation (0611R/S/T/U, embedded in projection runtime)
purpose: Runtime mode flag (standard-import-mode vs editable-building-mode), import bypass, pixel-sampling isolation resolver, plus five embedded audits (0611L/M/N/O/P)
file: wall/systems/presentation/buildingEditProjectionRuntime.js (setBuildingAuthorityMode, resolveEditableVisualIsolation, audit* functions)
introducedBy: 0611L–0611U spec chain
visibleResult: None — the chain attempted visual isolation while the Standard import remained loaded; isolation was never visually achieved (root cause recorded in 0612E header)
status: FAIL
keep: no
reason: Diagnostic scaffolding for a hypothesis that was disproven. The 'editable mode' concept survives; its mechanism moved to a style switch.
replacedBy: editableBasemapAuthority (0612E) + threeViewStyleParityLock (0612F)
```

```yaml
name: Building Authority Runtime (0612A)
purpose: Boot-time validation/creation of host building layer wos-host-building-layer; boot classification (READY/SOURCE_MISSING/…)
file: wall/systems/presentation/buildingAuthorityRuntime.js (v1.0.0)
introducedBy: 0612A_WOS_HostBuildingLayerBootRepair
visibleResult: None — NOT loaded by wall/index.html (or any HTML); it has never executed
status: FAIL
keep: no
reason: Never integrated, so never ran. Duplicates 0611Q's host-layer logic already inside the projection runtime, under a conflicting layer ID (wos-host-building-layer vs wos-host-buildings-3d). The host-layer approach itself is obsolete after the 0612E pivot.
replacedBy: editableBasemapAuthority (0612E)
```

```yaml
name: Building Replacement Minimum Visible Result (0612B)
purpose: Minimal click→replace→render proof using its own source/layer (wos-building-replacements / wos-building-replacement-layer)
file: wall/systems/presentation/buildingReplacementMinimumVisibleResult.js (v1.0.0)
introducedBy: 0612B_WOS_BuildingReplacementMinimumVisibleResult
visibleResult: None — NOT loaded by wall/index.html; it has never executed
status: DUPLICATE
keep: no
reason: Parallel re-implementation of what buildingReplacementRuntime already does and has visually proven. Depends on 0612A's layer ID, which also never runs. Two replacement renderers with different layer IDs cannot both be canonical. (Not in this rev's file list but present in source and loaded-state relevant.)
replacedBy: buildingReplacementRuntime (0612C head)
```

```yaml
name: Selected Buildings Only Mode (0612D)
purpose: Disable Mapbox Standard 3D buildings globally via map.setConfigProperty (8 config-key variants tried across all imports)
file: wall/systems/presentation/selectedBuildingsOnlyMode.js (v1.0.1)
introducedBy: 0612D_WOS_SelectedBuildingsOnlyMode
visibleResult: None — 0612E's header records the outcome: config keys are accepted but produce NO visual change; showBuildingExtrusions is not a valid key
status: FAIL
keep: no
reason: Its sole mechanism is documented (by the very next build) as ineffective. Still loaded in wall/index.html and still registers global console shortcuts, adding noise on a failed path.
replacedBy: editableBasemapAuthority (0612E)
```

```yaml
name: Editable Basemap Authority (0612E)
purpose: Switch Wall to dark-v11 (no Standard import, no Standard 3D building system) for editable workflows; restore broadcast style on exit; convergence chain re-adds WOS layers
file: wall/systems/presentation/editableBasemapAuthority.js (v1.0.0)
introducedBy: 0612E_WOS_NonStandardEditableBasemapAuthority
visibleResult: Style changed — Standard buildings gone, WOS replacements as the only 3D objects (recorded root-cause fix; 0612F builds on it as canonical state)
status: PASS
keep: yes
reason: First Wall system in the chain whose mechanism matches the actual root cause — and it converges Wall onto the SAME basemap where Studio's suppression was already verified. Smallest surface area (delegates the switch to MapboxViewportRuntime.setPresentationMode).
replacedBy: n/a
```

```yaml
name: Three-View Style Parity Lock (0612F, Parity Authority)
purpose: Single shared visual-authority state across Wall / Studio Author / Studio Preview; cross-tab lock via localStorage; verify()/apply()/report()
file: wall/systems/presentation/threeViewStyleParityLock.js (v1.0.0; loaded by BOTH wall/index.html and studio/index.html)
introducedBy: 0612F_WOS_ThreeViewStyleParityLock
visibleResult: Not verified — newest file in the effort; verify() exists but no recorded PASS; parity (all three views identical) has no documented visual confirmation
status: PARTIAL_PASS
keep: yes (pending verification)
reason: Correctly layered on 0612E and on MapboxAdapter.setStyle('dark'). Snapshot/verify design is sound, but it has not yet produced a verified parity result, and it adds another owner of "which style is active" (Section 2).
replacedBy: n/a
```

```yaml
name: Mapbox Viewport Runtime (Wall Map Authority)
purpose: Owns the Wall Mapbox map instance, style registry (STYLES.operator = dark-v11, presentation style), setPresentationMode switch
file: wall/runtimes/mapboxViewportRuntime.js
introducedBy: pre-effort (core runtime)
visibleResult: Style changed (executes the actual setStyle used by 0612E)
status: PASS
keep: yes
reason: The real owner of Wall map/style state. Every working Wall path routes through it.
replacedBy: n/a
```

---

## 2. Duplicate / conflicting / overlapping ownership

**Duplicate ownership — source-building suppression (two full implementations):**
- Studio: `mapboxAdapter.js` `_applyHiddenSourceSuppression` + expression builders
  (`_buildHiddenOpacityExpr/_buildHiddenColorFallbackExpr/_buildHiddenHeightExpr/_buildHiddenBaseExpr`),
  footprint/group/compound-aware (0610P/Q, patched 0611B/C/D)
- Wall: `buildingEditProjectionRuntime.js` `_apply` + its own expression builders
  and 4-phase footprint expansion (0610I/J/K, 0611G/J)
Same responsibility (hide a source building per-feature), two divergent code
paths that learn fixes at different times — Studio verified height suppression
on 0611D; Wall adopted it separately in 0611G.

**Duplicate ownership — replacement geometry rendering (declared copy):**
- Wall: `buildingReplacementRuntime.js` (wos-replacement-markers / wos-replacement-layer)
- Studio: `buildingPreviewRuntime.js` (wos-preview-replacements / wos-preview-layer)
`ARCHETYPE_CFG`, `ARCHETYPE_MATERIALS`, `HEIGHT_MODE_MUL`, and the geometry
helpers are intentional copies with an in-file "must be kept in sync" note.
Archetype color constants additionally appear in `mapboxAdapter.js` and
`buildingEditProjectionRuntime.js` (4 copies total).

**Duplicate ownership — host building layer (conflicting IDs):**
- 0611Q inside `buildingEditProjectionRuntime.js` owns `wos-host-buildings-3d`
- 0612A `buildingAuthorityRuntime.js` owns `wos-host-building-layer`
Two host-layer creators, two layer IDs; one loaded and obsolete, one never loaded.

**Duplicate ownership — replacement rendering on Wall (conflicting IDs):**
- `buildingReplacementRuntime.js` (loaded, verified) vs 0612B (never loaded).
0612D/0612E/0612F all hard-code the first set's IDs.

**Conflicting ownership — "remove Standard 3D buildings" (three mechanisms in source):**
1. 0611G–0611U: per-feature suppression + host layer + import bypass — failed
2. 0612D: setConfigProperty global disable — failed
3. 0612E: style switch to dark-v11 — works
All three remain present; 1 and 2 still execute discovery/listener code.

**Overlapping ownership — "which style is the map on":**
- Wall: `MapboxViewportRuntime.setPresentationMode` (actual switch),
  `EditableBasemapAuthority` (editable/broadcast intent),
  `ThreeViewStyleParityLock` (cross-tab canonical lock), plus pre-existing
  `MapStyleAuthority` (0525A) / `MapStyleRecoveryAuthority` (0603H) /
  `surfaceStylePresetRuntime` (style governance and patching)
- Studio: `MapboxAdapter.setStyle` (actual switch) + `ThreeViewStyleParityLock`
Style URLs are independently duplicated in `mapboxAdapter.js` with a comment
admitting `mapboxViewportRuntime.js` STYLES.* is the source of truth but is
not re-exported.

**Overlapping ownership — "editable mode" definition (three non-synchronized definitions):**
- projection runtime's `BUILDING_AUTHORITY_MODES` (0611R, runtime-only flag)
- `EditableBasemapAuthority._state.active`
- parity lock's derived `styleMode: 'editable-flat'`

---

## 3. Authorities with a verified visible result

- **Mapbox Adapter (Studio)** — hidden source buildings disappeared in Author
  mode; the 0611B/C/D audit chain visually established WHICH suppression
  mechanism actually works (height/base=0) and which silently fail.
- **Building Preview Runtime (Studio)** — replacement actors appeared in
  Preview with Wall-parity geometry/materials.
- **Building Edit Registry / Map Inspector / Map Lab View** — authored state
  round-tripped to visible results through the verified flows above.
- **Building Replacement Runtime (Wall)** — replacement appeared.
- **Building Edit Projection Runtime (Wall, core)** — old building
  disappeared, on fill-extrusion/classic layers only.
- **Editable Basemap Authority (Wall)** — style changed; Standard buildings
  removed (recorded root-cause fix; 0612F treats it as canonical).
- **Mapbox Viewport Runtime (Wall)** — style changed (executor of the above).

## 4. Authorities with no verified visible result

- **0611L–0611U chain (audits, host layer, modes, isolation resolver)** —
  FAIL/OBSOLETE: chased per-feature suppression of `model` layers, which is
  impossible; roughly 3,000 of the projection runtime's 5,206 lines.
- **0612A Building Authority Runtime** — FAIL: never loaded, never ran.
- **0612B Minimum Visible Result** — DUPLICATE: never loaded, never ran;
  duplicates the already-verified replacement renderer.
- **0612D Selected Buildings Only Mode** — FAIL: mechanism documented
  ineffective by 0612E.
- **0612F Parity Lock** — PARTIAL_PASS: runs in both contexts, but parity not
  yet visually verified.

---

## 5. Canonical Authority Graph

```text
KEEP
----
studio/mapLab/buildingEditRegistry.js     — manifest data truth (single writer)
studio/mapLab/mapboxAdapter.js            — Studio map + author suppression
studio/mapLab/buildingPreviewRuntime.js   — Studio preview parity rendering
studio/mapLab/mapInspector.js             — authoring UI (display-only)
studio/mapLab/mapLabView.js               — Studio coordinator
wall/runtimes/mapboxViewportRuntime.js    — Wall map + style switch executor
wall/.../buildingReplacementRuntime.js    — Wall replacement rendering
wall/.../buildingEditProjectionRuntime.js — CORE ONLY: manifest→color/suppression projection
wall/.../editableBasemapAuthority.js      — editable-mode basemap authority (dark-v11)
wall/.../buildingStyleKit.js              — shared archetype geometry

REVIEW
------
threeViewStyleParityLock.js        — sound design, loaded in all three views,
                                     parity not yet visually verified; also adds
                                     another owner of style state — needs an
                                     ownership decision
buildingEditProjectionRuntime.js   — 0611-era embedded subsystems (host layer 0611Q,
                                     modes 0611R/S/T/U, audits 0611L/M/N/O/P) are
                                     obsolete inside a KEEP file; scope-slimming review needed
Dual suppression implementations   — mapboxAdapter (Studio) vs projection runtime (Wall):
                                     same responsibility, two code paths; a single-owner
                                     decision is needed before further suppression work
Duplicated archetype constants     — 4 copies (adapter, projection, replacement, preview);
                                     declared sync hazard
mapStyleAuthority.js / mapStyleRecoveryAuthority.js
                                   — pre-existing style governance; overlap with editable
                                     basemap authority unresolved (which yields in editable mode?)

REMOVE
------
wall/.../buildingAuthorityRuntime.js                (0612A — never loaded, duplicate host-layer owner)
wall/.../buildingReplacementMinimumVisibleResult.js (0612B — never loaded, duplicate replacement renderer)
wall/.../selectedBuildingsOnlyMode.js               (0612D — loaded but mechanism proven ineffective)
```

---

## 6. Why did the Building Authority effort consume two days without a stable result?

Root causes only:

1. **A false technical assumption survived ~20 builds.** The Wall effort
   assumed Mapbox Standard `model` buildings could be suppressed per-feature
   (or per-config). They cannot — `model` layers have no data-driven height,
   and the Standard config keys produce no visual change. The 0610F→0611U
   chain kept adding phases (footprint queries, live-query passes, host
   layers, import bypasses, pixel sampling) on top of the assumption instead
   of falsifying it first.

2. **The two environments were not on the same substrate, so verified
   knowledge did not transfer.** Studio ran dark-v11 (classic fill-extrusion
   buildings); Wall ran the Standard import (model buildings). Studio's
   suppression was verified working by 0611D; Wall spent 0611G–0611U trying
   to reproduce that result on a basemap where the verified mechanism cannot
   apply. The eventual fix (0612E) was to put Wall on Studio's basemap — a
   parity decision that could have been made on day one had the substrate
   difference been treated as the variable.

3. **Accretion instead of replacement.** Every Wall hypothesis was layered
   into `buildingEditProjectionRuntime.js` (5,206 lines, 20 spec headers,
   five embedded audits). Failed mechanisms were never removed, so each new
   build reasoned about — and re-ran — all prior failed machinery.

4. **Each failure spawned a new authority; no failure retired one.** By 0612
   the source held two host-layer owners, two Wall replacement renderers,
   two independent suppression implementations (Studio/Wall), three "disable
   Standard buildings" mechanisms, three definitions of "editable mode," and
   four copies of the archetype constants. New systems were created faster
   than ownership conflicts were resolved.

5. **Integration was not part of done.** 0612A and 0612B were written to spec
   and never added to `wall/index.html`. No step in the build/review loop
   checked "does this file actually load?" — two builds' worth of work could
   not possibly produce a visible result.

6. **Contract drift between parallel systems.** Layer/source IDs diverged
   (`wos-host-building-layer` vs `wos-host-buildings-3d`;
   `wos-building-replacement-layer` vs `wos-replacement-layer`), and style
   URLs are duplicated rather than shared (`mapboxAdapter.js` vs
   `mapboxViewportRuntime.js` STYLES.*), so coexisting systems could not
   observe each other's results and downstream systems hard-coded one ID set.

7. **Validation was console-classification, not visual.** The effort produced
   extensive `status()` / `verify*()` / `audit*()` reporting, but specs
   advanced on classification strings rather than a recorded visual pass.
   `setConfigProperty` "succeeding" while changing nothing on screen (0612D)
   is the canonical example. The exception proves the rule: the Studio
   0611B/C/D patches — which were grounded in observed rendering behavior
   (alpha renders black; opacity match silently ignored) — are the only line
   of work whose conclusions held.

8. **Root-cause isolation came last instead of first.** The decisive facts
   (model layers unsuppressible; config keys inert; dark-v11 already proven
   in Studio) were each discovered at the END of a long build chain and
   recorded in the NEXT build's header. The architecture stabilized within
   hours of the root cause being written down (0612E → 0612F).

---

## Success definition check

- **What exists** — Section 1 (14 authorities/systems across Studio and Wall; 2 never loaded).
- **What works** — Section 3 (Studio: registry → adapter suppression → preview parity; Wall: projection core → replacement runtime → editable basemap, all on dark-v11).
- **What is duplicate** — Section 2 (suppression ×2, replacement geometry ×2 + constants ×4, host layer ×2, Wall replacement renderer ×2, Standard-disable ×3, editable-mode definition ×3, style URLs ×2).
- **What should be removed** — Section 5 REMOVE (0612A, 0612B, 0612D).
- **What becomes canonical** — Section 5 KEEP: manifest (registry) as data truth; Studio adapter + preview runtime for authoring; projection core + replacement runtime for Wall; all three views on the 0612E editable basemap; 0612F parity pending verification.

No implementation recommendations included. Review only.

---

## Addendum — 0612G v1.1.0 BUILD implementation record (2026-06-12)

Implemented per 0612G_WOS_BuildingAuthorityRecovery_v1.1.0_BUILD:

- R1: `selectedBuildingsOnlyMode.js` removed from `wall/index.html` (archive
  comment left in place). File header relabeled: `Status: obsolete-audit-artifact`,
  `ReplacedBy: 0612E`, `DoNotLoad: true`.
- R2: verified no active HTML loads `buildingReplacementMinimumVisibleResult.js`;
  forbidden IDs (`wos-building-replacements`, `wos-building-replacement-layer`,
  `wos-building-replacement-outline-layer`) have no active registrant.
- R3: SelectedBuildingsOnlyMode debug shortcuts no longer register (file does
  not execute).
- Load order: `buildingAuthorityRuntime.js` (0612A) now loads immediately
  before `buildingEditProjectionRuntime.js` in `wall/index.html`.
- Reclassifications applied to headers of `threeViewStyleParityLock.js`
  (support-system / governance-diagnostic / diagnostic-orchestration),
  `buildingReplacementRuntime.js` (not read-only; canonical Wall replacement
  renderer), `buildingAuthorityRuntime.js` (query substrate readiness only),
  `buildingEditProjectionRuntime.js` (suppression/projection compatibility
  runtime).
- Parity Debt note added to `studio/mapLab/buildingPreviewRuntime.js`.
- MapboxViewportRuntime canonical path decision: **`wall/runtimes/mapboxViewportRuntime.js`**
  (the path the repo actually uses; acceptable per spec). No duplicate created.
  No stale references to `wall/systems/presentation/...` or
  `wall/systems/runtime/...` variants found in code or 0612 specs.
