# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Safe to send to build.

# 0523C_WOS_MaritimeSpawnEcology_v1.2.1

## Purpose

Final deterministic completion patch for MaritimeSpawnEcology.

This version resolves:
- executable contract gaps
- deterministic spawn timing
- simulation-clock ownership
- rejection handling semantics
- ecology interface completion

## EcologyContext

```ts
type EcologyContext = {
  simulationTimeMs: number;
  weatherState: string | null;
  liveAISCountInZone: number;
  syntheticCountInZone: number;
  ecologySilenceActive: boolean;
};
```

## DensityProfile

```ts
type DensityProfile = {
  zoneId: string;
  suggestedCount: number;
  syntheticSlotsSuggested: number;
  ecologyScore: number;
  silenceProbability: number;
};
```

## Deterministic Spawn Interval

```ts
spawnIntervalMs = lerp(
  SYNTHETIC_SPAWN_INTERVAL_MAX_MS,
  SYNTHETIC_SPAWN_INTERVAL_MIN_MS,
  ecologyScore
);
```

Forbidden:
- Date.now()
- performance.now()
- Math.random()

Allowed:
- deterministic simulation clock
- deterministic seeded RNG

## Simulation Clock Ownership

`createdAtMs` must use simulation time.

Forbidden:
```ts
Date.now()
performance.now()
```

Allowed:
```ts
simulationClock.now()
```

## Rejection Handling

If MaritimeContinuityEngine rejects a request:

- no immediate retry
- interval advances as if request succeeded
- rejection telemetry emitted
- no recursive retry chains allowed

## populationPressure Ownership

`populationPressure` comes from the latest:

```ts
updatePopulationBudgetState()
```

No live PopulationHierarchy queries allowed.

## maxCoordinateEnvelope Ownership

Envelope derives from ecological zone geographic bounds.

If bounds are unavailable:
- reject request

## Global vs Local Budgets

Per-zone ceilings are local constraints.

Global synthetic budgets are hard global ceilings.

Both must pass independently.

## Validation Checklist

- [ ] EcologyContext defined
- [ ] DensityProfile defined
- [ ] Deterministic spawn interval defined
- [ ] createdAtMs uses simulation clock
- [ ] Rejection handling defined
- [ ] populationPressure source defined
- [ ] maxCoordinateEnvelope ownership defined
- [ ] Global vs local budgets clarified
- [ ] Replay determinism preserved
