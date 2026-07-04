# REVIEW: 0529_WOS_ActorPOVTraversalDoctrine_v1.0.0
**WOS Actor POV Traversal Doctrine**
Review date: 2026-05-29

---

## VERDICT: NOT READY FOR BUILD — 3 blocking issues, easily resolved

The doctrine is sound and the tasks are concrete. Structural gaps only.

---

## DEPENDENCY AUDIT

No YAML front matter. depends_on cannot be evaluated. Inferred dependencies:
current traversal runtime, traversalControlDeck.js, traversalHUD.js, flight camera system.

---

## BLOCKING ISSUES

### ISSUE-0529-001: No YAML front matter

No doc_id, version, depends_on, enables, status, owner, stage, freeze_decision,
or build_scope. Third spec in this review session without a header (0526C, 0526H v1.0.0,
and now this). Cannot be placed in the chain without these fields.

---

### ISSUE-0529-002: TraversalSpeedModel and TraversalAltitudeModel referenced but never defined

TraversalActor references two external types:

  speedModel: TraversalSpeedModel;
  altitudeModel?: TraversalAltitudeModel;

Neither type is defined anywhere in this spec. The speed ladder in the Speed Authority
section partially covers what TraversalSpeedModel would contain, and the altitude step
control partially covers TraversalAltitudeModel — but neither is formalized as a type.

An implementor building TraversalActor cannot construct valid speedModel or altitudeModel
values from this document. Define both types or inline their fields directly into
TraversalActor.

---

### ISSUE-0529-003: TraversalActor and TraversalPOVProfile use mixed TypeScript/JavaScript syntax

The type declarations use TypeScript type keyword but JavaScript value syntax
(single-quoted strings, no semicolons after property definitions):

  type TraversalActor = {
    actorType: 'aircraft' | 'car' | 'drone' ...   // JS string literals
    currentPosition: { lat: number; lng: number; altitudeFt?: number };
    povProfiles: TraversalPOVProfile[];
  }

This is inconsistent — TypeScript type syntax expects double-quoted strings or
unquoted union members, and the closing brace has no semicolon. Standardize to
consistent TypeScript syntax throughout. This is a minor fix but required for the
type declarations to be used directly as implementation contracts.

---

## NON-BLOCKING OBSERVATIONS

NB-01: TraversalPOVProfile.offsetMeters reference frame undefined
{ x: number; y: number; z: number } in meters — but relative to what?
Actor-local coordinate space? World space? Map north-up? Define the reference frame
or it will be implemented inconsistently.

NB-02: Speed ladder migration path unspecified
Existing routes were authored at 20x/40x/80x. The new ladder (0.25x–80x) reframes
what "normal" means. No migration note exists. Does 1x mean real-time traversal for
all route types? A 500km flight at 1x is 1.5 hours. Document whether 1x is ever a
practical default or whether it exists only as a reference point.

NB-03: _wos.debug.traversalDeck namespace differs from chain pattern
Established debug namespace pattern is _wos.vesselTopology, _wos.waterMemory,
_wos.lightAuthority, etc. — flat under _wos. This spec uses _wos.debug.traversalDeck
which adds a .debug. level. Either follow the established pattern
(_wos.traversal.actor()) or document the namespace deviation.

NB-04: Altitude-to-zoom mapping is an investigation task, not a spec
The five observation anchors (zoom 11-15) are labeled as non-final. This is correct
and honest scoping. When the investigation is complete, the findings should be
committed back to a v1.0.1 as confirmed constants.

---

## WHAT THIS SPEC GETS RIGHT

- Actor/POV separation is the correct architectural distinction — it cleanly resolves
  the "is the user watching a plane or riding a camera" ambiguity
- Speed ladder from 0.25x to 80x with 1x as world-truth reference is correct doctrine
- Altitude as an explicit stepped control (not freeform slider) is the right UX call
- Cloud reality-anchoring doctrine is correct: real weather truth, WOS presentation
  interpretation — no fake clouds on clear days
- REAL/SIM time split in HUD is an important observability improvement
- Hero vehicle as Actor+Route+POV (not traffic ecology) is correct scoping
- Non-goals list is tight and prevents scope creep into Drive/Walk/Bike
- Tasks 1-6 are concrete, targeted, and independently implementable

---

## PATH TO BUILD

v1.0.1 needs:
1. Add YAML front matter (doc_id, version, depends_on, stage, freeze_decision)
2. Define TraversalSpeedModel and TraversalAltitudeModel types
3. Standardize type syntax to consistent TypeScript

All three are mechanical. The doctrine and task definitions are BUILD-ready as written.
