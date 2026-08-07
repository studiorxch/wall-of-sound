````
# AGENTS.md

## Repository

This repository contains the StudioRich MUSIC, MAPS, RACETRACK, RADIO,
GlyphLab, and Wall systems.

Treat the current repository, committed implementation, tests, current-status
documents, and verified runtime behavior as authoritative.

Do not reconstruct systems from assumptions, old conversations, outdated plans,
or superseded specifications.

## Architecture

Follow the existing architecture:

```text
data → logic → UI
````

Keep domain models and persistent data separate from application logic and
presentation components.

Extend existing stores, selectors, authorities, adapters, bridges, runtimes,
and engine primitives before introducing new abstractions.

Do not create parallel implementations of an existing system.

## Working Rules

1.  Inspect the existing architecture before editing.
2.  Read relevant current-status documents and recent commits before planning.
3.  Extend verified systems; do not create parallel replacements.
4.  Keep changes bounded to the requested checkpoint.
5.  Do not broadly refactor, rename, move, or delete established infrastructure
    without explicit approval.
6.  Preserve existing public behavior unless the checkpoint explicitly changes
    it.
7.  Run relevant tests before and after implementation.
8.  Live-verify user-facing behavior when practical.
9.  Do not leave TODOs, placeholder implementations, mock completion paths, or
    silent fallbacks.
10. Do not report a checkpoint as complete unless its acceptance criteria have
    been verified.
11. Report uncertainty and unresolved behavior explicitly rather than guessing.
12. Keep completed checkpoints independently reviewable.

## Protected MUSIC Infrastructure

Preserve and reuse:

- library and track identity models
- Catalog, External, Sounds, Loop, and stem-library boundaries
- playlist sequencing and eligibility logic
- authoritative BPM and key resolution
- crate membership and filtering logic
- playback engine primitives
- playback readiness logic
- transition scoring
- transition-plan authority
- transition evidence-state lifecycle
- stale-plan validation
- deck-readiness and playback-state gates
- active and legacy execution routing
- execution audit and fallback reporting
- RADIO publication and playback infrastructure

Do not create:

- a second audio engine
- duplicate track identity authority
- duplicate playlist eligibility logic
- a second transition-plan authority
- a replacement hard-cut implementation
- a parallel RADIO publication pipeline

## DJ Transition Infrastructure

The DJ-transition system contains verified infrastructure and must not be
rebuilt from scratch.

Preserve and reuse:

- transition-plan lifecycle and evidence states
- approved-plan execution authority
- stale-plan validation
- active-mode family whitelist
- deck readiness and playback-state gates
- active execution with complete legacy fallback
- existing audio-engine primitives
- existing hard-cut execution path
- authority-gate and fallback reporting

The existing verified execution path includes:

```
resolved clean_cut
→ compiled clean_cut_hard_cut
→ engine.executeHardCut()
→ active execution or complete legacy fallback
```

A real transition pair, `White Ropes → Beau Mot Plage`, was previously
live-verified across multiple transition cycles.

A previous readiness-gate defect was corrected: the authority layer must not
require an outgoing-deck readiness condition that the underlying hard-cut
engine does not require.

Known product gaps currently include:

- no complete visible dual-deck workspace
- independent Deck A and Deck B runtime ownership still requires confirmation
- transition authority is not yet exposed through a complete operator-facing
  surface
- RADIO does not yet receive a continuous dual-deck transition pipeline

Do not create a second transition engine, second deck authority, second audio
engine, or replacement hard-cut implementation.

Recover and expose the existing infrastructure.

Read the current DJ-transition status or handoff document before making
transition-related changes. If no current document exists, perform a read-only
architecture audit before implementation.

## Protected MAPS / RACETRACK Infrastructure

Preserve and reuse:

- Geographic library
- Vehicle library
- Overlay library
- Orb library
- geographic-style system
- World system
- itinerary creation and routing
- itinerary run authority
- race-course and race-lane models
- RACETRACK course-package compiler
- active Orb hero and fallback
- route presentation infrastructure
- RACETRACK presentation and runtime infrastructure
- MAPS-to-Wall bridges
- existing persistence and registry systems

Use **Worlds**, not **Scenes**, for the higher-level system that defines the
complete visual reality, including:

- geographic style
- hero or Orb
- traffic representation
- atmosphere
- overlays
- route presentation
- optional sound or RADIO identity

Do not recreate deprecated palette infrastructure when the current system uses
geographic styles.

Do not create a second routing authority, itinerary authority, Orb authority,
race runtime, or presentation bridge.

## Protected GlyphLab Infrastructure

Preserve and reuse:

- full-duration pulse truth
- beat-grid adaptation
- one-pulse-per-glyph behavior
- continuous glyph-run formation
- connection grammar
- silent bar spacing
- drum-event detection
- clap-ring and accent vocabulary
- spectral-motion or activity-trace analysis
- full-canvas layout
- deterministic SVG export
- persisted mapping and composition models

GlyphLab is not a waveform generator.

Its purpose is to create structured, visually compelling notation derived from
music and sound.

Do not reduce GlyphLab output to generic waveform decoration or recreate logic
that already exists in the glyph data and logic layers.

## RADIO

RADIO is a persistent StudioRich system, not a temporary playback demo.

Preserve:

- immutable published packages
- manifests and versioning
- decode-back verification
- rollback behavior
- rights and source-eligibility gates
- current player and publication bridges
- synchronized now-playing state

Future dual-deck and transition work should extend RADIO through established
interfaces rather than replacing its publication or playback architecture.

## Wall

Treat the Wall as a distinct presentation and runtime surface that may consume
state from MAPS, RACETRACK, RADIO, and future collaborative systems.

Preserve established Wall bridges and presentation authorities.

Do not merge Wall-specific rendering logic directly into MUSIC data or domain
logic when an adapter, bridge, or presentation layer is appropriate.

## WOS-share and Project Documentation

WOS-share and repository documentation contain planning documents, handoffs,
build specifications, references, and project history.

Use them to recover intent and prior decisions, but treat the following as the
technical authority, in this order:

1.  current committed implementation
2.  passing tests
3.  verified runtime behavior
4.  current-status and handoff documents
5.  older build specifications and historical planning documents

Do not copy older specifications over newer working code.

When documentation and implementation disagree:

1.  inspect recent commit history;
2.  inspect the current implementation;
3.  run the relevant tests;
4.  verify the current application;
5.  report the discrepancy before changing behavior.

Update the relevant current-status or handoff document after each completed
checkpoint.

Do not rewrite historical completion reports to make them describe newer work.
Create or update the designated current-status document instead.

## Generated Files

Generated metadata, caches, temporary analysis files, and build output must not
be committed unless the repository explicitly requires them.

Ableton `.asd` analysis files are generated metadata and must not be committed.

The root `.gitignore` should contain:

```
*.asd
```

Preserve required stem manifests and intentional library metadata.

Do not delete or ignore source audio, manifests, indexes, or generated assets
that the application deliberately uses without first confirming their role.

## Verification

Before declaring a checkpoint complete:

- run all directly affected tests
- run broader regression tests when shared infrastructure changes
- confirm the application builds
- confirm the application launches
- verify prior completed behavior remains intact
- live-verify the requested workflow when practical
- inspect browser console and runtime errors
- confirm persistence and reload behavior when state is involved
- verify fallback behavior when authority gates are involved
- report exact files changed
- report tests run and their results
- report live verification performed
- report any known limitations
- report the next safe checkpoint

A passing unit test suite alone is not sufficient for user-facing runtime work.

## Live Verification

For user-facing changes, verify against real application data where practical.

Do not claim successful live verification based only on:

- mocked data
- isolated unit tests
- static type checking
- reading the code
- a build completing successfully

When a real workflow cannot be verified, state exactly what prevented it.

## Git Safety

- Inspect `git status` before editing.
- Never overwrite unrelated uncommitted work.
- Do not discard user changes.
- Do not use destructive Git commands without explicit approval.
- Do not amend, squash, reset, rebase, or force-push without explicit approval.
- Do not rewrite published history.
- Do not delete branches or tags without explicit approval.
- Keep each completed checkpoint in a clean, reviewable commit.
- Do not leave large architectural changes uncommitted at the end of a shift.
- Update the current-status or handoff document before ending a shift.
- Report the resulting commit hash after committing.

If the working tree is already dirty, identify which changes belong to the
current checkpoint before staging or committing.

Do not use `git add -A` blindly when unrelated work may be present.

## Checkpoint Discipline

Implement one bounded checkpoint at a time.

Each checkpoint should have:

- a defined problem
- protected infrastructure
- explicit acceptance criteria
- expected files or systems involved
- tests
- live-verification requirements
- a clean completion report
- a commit

Do not combine unrelated MUSIC, MAPS, RACETRACK, RADIO, GlyphLab, and Wall work
into one implementation checkpoint unless the feature genuinely crosses those
boundaries.

## Shift Handoff

Before ending a development shift:

1.  ensure the working tree is understood;
2.  commit completed work;
3.  leave incomplete work uncommitted only when clearly documented;
4.  update the authoritative current-status or handoff document;
5.  list files changed;
6.  list tests run;
7.  record live-verification results;
8.  record known issues;
9.  identify the next safe checkpoint;
10. warn the returning engineer about infrastructure that must not be reverted.

A returning engineer or agent must first perform a read-only synchronization
pass.

The returning engineer must treat the current repository and newer commits as
authoritative and must not restore files from an older mental model or prior
conversation.

## Completion Reports

A completion report must distinguish:

- implemented
- tested
- live-verified
- not verified
- deferred
- blocked

Do not describe planned, partially implemented, or unverified behavior as
complete.

Include exact evidence where possible:

- test names
- command results
- real tracks or records used
- browser workflow exercised
- persistence checks
- fallback paths observed
- commit hash

## Naming and Terminology

Use established StudioRich terminology consistently:

- MUSIC
- MAPS
- RACETRACK
- RADIO
- GlyphLab
- Glyph Notes
- Wall
- Worlds
- Orb
- Geographic
- Vehicle
- Overlay

Do not reintroduce retired names or rename established concepts without explicit
approval.

## Final Rule

Preserve working infrastructure.

Inspect first, extend second, verify third, and only then report completion.
