# StudioRich Canonical Architecture Registry

This directory describes **current architectural truth** — what is actually
true about this codebase right now. It is not a history of how anything got
built, and it is not a plan for what should get built next.

```
SPEC   = what should be built    (a batch brief, a feature spec)
REPORT = what happened           (a completion report for one batch)
STATE  = what is true now        (this directory)
```

A SPEC and a REPORT are both point-in-time documents about *how we got here*.
The files in `docs/architecture/` are the opposite: they are meant to be
overwritten in place whenever the truth they describe changes, so a reader
never has to reconstruct current state from a chain of historical batches.

## The permanent rule

**ARCHITECTURAL BOOKKEEPING IS PART OF IMPLEMENTATION.**

Any batch that changes one of the following must update the relevant file in
this directory in the *same commit* as the code change:

- system ownership
- canonical implementation
- runtime/data flow
- persistence authority
- identity relationships
- deployment procedure
- integration boundaries
- deprecation/replacement status
- known architectural debt

If a batch changes none of those, its completion report should say so
explicitly:

```
Architecture docs: no update required.
```

## The rule for future recon

**Read canonical architecture before performing broad recon.**

- If this directory and the current code agree, do not re-prove the
  architecture from git history or old reports — just use it.
- If they conflict, perform only enough targeted recon to resolve that
  specific discrepancy, then correct the canonical document.
- Historical investigation (git log, old WOS-share reports, superseded
  specs) is a last resort for establishing a *current-state* fact that
  cannot otherwise be confirmed from the code — never the default first
  step.

**RECON IS NOT COMPLETE UNTIL ITS FINDINGS ARE RECONCILED WITH THE
ARCHITECTURE REGISTRY.**

Any recon, investigation, audit, feasibility study, or implementation
discovery that establishes facts about current system behavior must finish
by comparing those findings against the canonical architecture
documentation.

Confirmed current-state findings must either:

1. be incorporated into the appropriate canonical STATE documentation; or
2. be explicitly verified as already represented there.

Do not leave established architectural truth only in a REPORT, PROPOSAL,
recon document, completion message, test output, or conversation.

Classify findings according to their actual status:

```
STATE            = what is true now
DEBT             = a known missing capability, inconsistency, limitation,
                    or required corrective work
PROPOSAL / RECON = analysis, evidence, alternatives, recommendations,
                    and future possibilities
```

A recon document may remain as supporting evidence and historical analysis,
but it is not a substitute for canonical STATE documentation. Do not
promote speculation, recommendations, future architecture, or unimplemented
designs into STATE.

If a recon establishes no new architectural truth, explicitly report:

```
Architecture registry: recon findings already represented; no update required.
```

This reconciliation is part of completing the recon, not a separate
optional cleanup task. This is the one canonical statement of the rule —
other contributor/agent guidance should point here rather than restating
it in full.

## What's in here

| File | Covers |
|---|---|
| [home/README.md](home/README.md) | Development-only persistent HOME skeleton, contract and HOST-01 verification |
| [SYSTEMS.md](SYSTEMS.md) | The StudioRich system registry — MUSIC, RADIO, MAP/SUBWAY, MEMBER IDENTITY |
| [OWNERSHIP.md](OWNERSHIP.md) | Which system/module owns which responsibility, and canonical-vs-legacy status |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Verified deployment facts and procedure, especially RADIO |
| [DEBT.md](DEBT.md) | Actionable architectural debt, each with a revisit trigger |
| [radio/README.md](radio/README.md) | The one-page RADIO architecture map — read this before any RADIO batch |
| [admin/README.md](admin/README.md) | ADMIN control plane — its relationship to MEMBER, visibility-vs-authorization rule, current RADIO scope |

## Proposed architecture (not current-state truth)

The `proposals/` directory is an explicitly separate specification area.
Entries there must not be read as implemented architecture. Promote facts into
current-state pages only with their verified implementation checkpoints.

- [STUDIORICH HOME persistent host V1](proposals/HOME_PERSISTENT_HOST_V1.md) —
  proposed same-origin surface hosting, public URL/history contract, persistent
  RADIO session, browser validation gates, and staged migration. Only the development HOST-01/02/03 skeleton (real MAP + real BLACKBOOK, both hosted) is implemented; see the current HOME page.
- [HOST-03A — hosted MEMBER authentication boundary](proposals/HOST_03A_MEMBER_AUTH_BOUNDARY.md) —
  recon into the real defect HOST-03 human acceptance found (a real Google
  popup sign-in from a HOME-hosted surface recreates HOME's own top-level
  document); recommends a narrow auth transport/coordination adapter owned by
  HOME. Implemented as HOST-03B (`cff1e12`), partially human-accepted.
- [Persistent MEMBER presentation boundary](proposals/MEMBER_PRESENTATION_BOUNDARY.md) —
  recon into whether persistent HOME should also render a shared, recognizable
  MEMBER/avatar control across hosted surfaces (MAP has one; BLACKBOOK
  doesn't), kept explicitly distinct from identity authority and OAuth
  transaction ownership. Recon only — not implemented.
- [RADIO β0.1 operator playlist/programming recon](proposals/RADIO_OPERATOR_WORKFLOW_RECON.md) —
  what exists today across MUSIC Playlist → RadioPlaylist → immutable
  Package → Program → Channel rotation → broadcast, entirely through real
  UI, versus the one genuinely terminal-only step (publishing an export to
  the public site) and Program's own create-only (no update/delete)
  limitation; a scheduling capability matrix; and a future clock-scope
  note. Recon only — not implemented.
- [Station Base Truth / generic representation architecture](proposals/STATION_05_BASE_TRUTH_RECON.md) —
  assesses the existing MUSIC-side `stationGeometryTypes.ts`/
  `stationClassificationTypes.ts`/archetype subsystem as a candidate
  generic Station Base Truth (tracks/platforms/adjacency, independent of
  3D authoring); finds island platforms are type-valid but functionally
  unproven, proposes two additive fields (`platformSide`,
  `adjacentTrackId`) to support island topology and door-side derivation
  without a parallel type system. Recon record — implemented as STATION-06
  (items 1-3 of its own recommendation: the two additive fields, the
  `UG_ISLAND_2TRACK` archetype, and the `instantiateStationArchetype()`
  dispatch repair); see [subway/README.md](subway/README.md)'s "STATION-06"
  section for current-state truth. A real island station seed remains
  future work.
- [Detail View subject / station writable-surface architecture](proposals/STATION_09_DETAIL_SUBJECT_RECON.md) —
  recon for connecting Platform's Overview to its Detail View: inventories
  `StationWallSurface`/`suitableForArt`/`adjacentTrackId`, the
  StationGeometryEditor, BLACKBOOK's Workspace/Artwork/Artboard model, and
  the separate car-surface `ArtworkPlacement` precedent; proposes an
  additive `StationDetailSubjectRef` (working name) pointer type, argues
  observable/writable/passengerAccessible are independent and mostly
  derived rather than stored facts, and that a facelift never changes
  element identity since ids are already deterministic/role-based. Recon
  only — not implemented; proposes the smallest STATION-10 follow-up.
