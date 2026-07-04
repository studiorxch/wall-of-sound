# REVIEW: 0526B_WOS_MaritimeWaterMemory_v1.0.0
**WOS Maritime Water Memory**
Review date: 2026-05-26

---

## VERDICT: NOT READY FOR BUILD

Four blocking issues in the data model and reference implementations. Six of seven dependencies unresolved.

---

## DEPENDENCY AUDIT

| Dependency | Status |
|---|---|
| 0525F_WOS_ProceduralVesselTopology_v1.0.1 | PHANTOM — only v1.0.0 reviewed (3 blocking issues) |
| 0526A_WOS_MaritimeWakeSignature_v1.0.0 | UNREVIEWED — never reviewed in chain |
| 0525A_WOS_MapStyleAuthority_v1.0.2 | PHANTOM — v1.0.2 not yet produced |
| 0525D_WOS_SurfaceStylePresets_v1.0.1 | UNREVIEWED — never reviewed in chain |
| 0525E_WOS_VisibilityClassRuntime_v1.0.0 | REVIEWED — NOT READY (6 blocking issues) |
| 0523D_WOS_MaritimeWakeAuthority_v1.2.1 | REVIEWED — ✅ READY FOR BUILD |
| 0523F_WOS_MaritimeContinuityDensity_v1.2.0 | REVIEWED — NOT READY (blocked on 0523R v1.2.3) |

6 of 7 dependencies unresolved. Only 0523D is cleared.

---

## BLOCKING ISSUES

### ISSUE-0526B-001: `WaterMemoryCell` is fully `readonly` but reference decay logic mutates its fields

**Severity: BLOCKING**

`WaterMemoryCell` declares all fields as `readonly`:

```ts
type WaterMemoryCell = {
  readonly intensity: number;
  readonly ageMs: number;
  // ...all fields readonly
};
```

The reference decay implementation then directly mutates those fields:

```ts
cell.intensity *= Math.pow(0.5, deltaMs / DEFAULT_DECAY_HALF_LIFE_MS);
cell.ageMs = nowMs - cell.createdAtMs;
```

This is a direct type/implementation contradiction. TypeScript will reject these assignments at compile time.

Fix: either declare `intensity` and `ageMs` as mutable (remove `readonly`), or adopt an immutable update pattern where cells are replaced rather than mutated in place. The choice should be explicit in the spec — it has performance implications for the hot update path.

---

### ISSUE-0526B-002: `WaterMemoryCell.createdAtMs` missing from type definition

**Severity: BLOCKING**

The decay reference logic reads `cell.createdAtMs`:

```ts
cell.ageMs = nowMs - cell.createdAtMs;
```

But `WaterMemoryCell` does not define this field:

```ts
type WaterMemoryCell = {
  readonly cellId: string;
  readonly x: number;
  readonly y: number;
  readonly intensity: number;
  readonly ageMs: number;
  readonly dominantClass: WaterMemoryClass;
  readonly dominantKind: WaterMemoryStampKind;
  readonly headingVectorX: number;
  readonly headingVectorY: number;
  readonly churn: number;
  // no createdAtMs
};
```

`createdAtMs` must be added to the type. Without it, the age-tracking decay logic is unimplementable as written.

---

### ISSUE-0526B-003: Six internal functions referenced in implementations but never declared

**Severity: BLOCKING**

The reference implementations for `stampWakeMemory` and `updateWaterMemory` call six internal functions that are never declared anywhere in the spec:

| Function | Called in |
|---|---|
| `makeStampId(input)` | `stampWakeMemory` |
| `resolveMemoryProfile(vesselClass)` | `stampWakeMemory` |
| `wakeModeToStampKind(wakeMode)` | `stampWakeMemory` |
| `addStampToCells(stamp)` | `stampWakeMemory` |
| `removeCellsBelowIntensity(threshold)` | `updateWaterMemory` |
| `enforceCellLimit(max)` | `updateWaterMemory` |

`resolveMemoryProfile` is the most critical — it governs `baseIntensity` and `persistenceMs` for every vessel class, which is the heart of the class-specific memory behavior. Its return type, inputs, and per-class output values are entirely undefined in this spec.

`wakeModeToStampKind` is the bridge between wake signatures (0526A's domain) and this spec's `WaterMemoryStampKind` enum. Without it, the stamp pipeline cannot be reconstructed.

The canonical artifact rule requires this document to be reconstructable standalone. With six undeclared dependencies in the reference logic, it is not.

---

### ISSUE-0526B-004: `WaterMemoryStampInput.vesselClass` and `wakeMode` typed as loose `string`

**Severity: BLOCKING**

Same pattern flagged in ISSUE-0525F-002 and ISSUE-0525E for upstream specs:

```ts
type WaterMemoryStampInput = {
  readonly vesselClass: string;   // should be WaterMemoryClass
  readonly wakeMode: string;      // should reference 0526A's WakeMode type
};
```

`WaterMemoryClass` is defined in this spec and available. `wakeMode` should reference the typed enum from 0526A. Loose string typing at the stamp entry point means any malformed input silently passes through to `normalizeClass` and `wakeModeToStampKind`, both of which are themselves undeclared (see ISSUE-0526B-003).

---

## NON-BLOCKING OBSERVATIONS

**NB-01: `performance.now()` determinism exception undocumented**
`stampWakeMemory` uses `input.nowMs ?? performance.now()`. The `nowMs` parameter is optional, meaning callers who omit it produce non-deterministic stamps. Given that `seed` is explicitly in the type (suggesting determinism is intended for visual variation), the spec should either require `nowMs` or document the determinism exception.

**NB-02: `normalizeClass` called in reference implementation but not declared**
Referenced in `stampWakeMemory` but not listed in core functions. Minor — similar to NB-01 in 0525F. Add to the internal function list or declare it as a core utility.

**NB-03: `SBE.` namespace undefined** — consistent with upstream chain, non-blocking.

---

## WHAT THIS SPEC GETS RIGHT

- The doctrine distinction between "motion history" and "fluid simulation" is clean and consistently enforced throughout
- Decay formula (`intensity *= pow(0.5, deltaMs / halfLifeMs)`) is correct and cheap
- Cell-count bounds (`MAX_ACTIVE_STAMPS = 800`, `MAX_ACTIVE_CELLS = 1200`) show appropriate performance discipline
- Class memory behavior section is well-differentiated — cargo, ferry, tug, recreational, military all read as distinct behavioral identities
- Rendering doctrine (subtle, atmospheric, below active wakes, no neon/blur/particles) is the right call
- Frame render order (memory → active wakes → topology → lights) is architecturally correct
- Integration guard pattern is correct: WaterMemory must never become required for wake signatures
- Failure mode handling (drop oldest, skip frame, disable render pass) is appropriately defensive
- Screen-space cell grid for v1 is a pragmatic and honest scoping decision

---

## CHAIN STATUS

The spec is well-conceived and the performance doctrine is sound. The four blocking issues are all mechanical type/implementation gaps — none require architectural revision.

Critical path: `0523R v1.2.3` → `0523E/F` → `0525A v1.0.2` → `0525B/C/D` → `0525E v1.0.1` → `0526A` → `0525F v1.0.1` → `0526B v1.0.1`
