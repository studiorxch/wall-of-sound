# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Architecture + governance pass before build.

# 0523C_WOS_MaritimeSpawnEcology_v1.0.0

## Purpose

Define how maritime vessel populations naturally distribute across the harbor without violating:

- AIS truth
- continuity doctrine
- runtime determinism
- taxonomy authority boundaries
- population hierarchy authority boundaries

This spec governs:

- where vessel classes tend to exist
- how density forms geographically
- how harbor corridors sustain realism
- how vessel ecology creates believable harbor rhythm

This spec does NOT govern:

- AIS motion
- vessel steering
- runtime pathfinding
- wake rendering
- camera behavior
- atmosphere orchestration
- gameplay
- vessel AI

# Core Principle

Spawn ecology describes probabilistic harbor presence, NOT simulation authority.

# Canonical Maritime Ecological Zones

## Industrial Corridor
- Port Newark
- Elizabeth
- Kill Van Kull

Dominant:
- CARGO
- TANKER
- INDUSTRIAL
- TUG
- SERVICE

## Ferry Transit Corridor
- Staten Island Ferry
- East River ferry lanes

Dominant:
- FERRY
- PASSENGER
- SERVICE

## Open Recreational Water

Dominant:
- RECREATIONAL
- FISHING
- SERVICE

# AIS Authority Boundary

AIS truth overrides ecology.

Ecology is expectation + interpretation only.

# Synthetic Ecology Vessel Rules

Synthetic ecology vessels must:
- use explicit synthetic IDs
- never impersonate AIS identities
- never overwrite live AIS
- remain internally distinguishable

# Density Governance

Spawn ecology remains subordinate to PopulationHierarchy.

# Ecological Silence

The harbor must permit empty water.

Silence is part of realism.

# Validation Checklist

- [ ] Ecology never overrides AIS truth
- [ ] Ecology never mutates lifecycle state
- [ ] Ecology remains probabilistic
- [ ] Empty-water states possible
- [ ] Synthetic vessels are explicitly marked

# Current Assessment

Stage: [REVIEW]  
Freeze Decision: REVIEW
