# MUSIC

**MUSIC** is the Wall of Sound music authoring system for organizing tracks, repairing metadata, building crates, generating playlist path options, preparing sampler banks, and eventually sending scheduled broadcast packages to stream output.

MUSIC replaces the previous PLAY product namespace. Historical PLAY specs and TypeScript symbols may still exist for continuity, but the active product/app name and implementation directory are now **MUSIC**.

---

## Product Sentence

```text
MUSIC turns tracks, crates, playlists, and broadcast schedules into programmable music channels.
```

MUSIC is not only a playlist builder. It is a music-library and broadcast-prep environment where tracks become reusable pools, pools become playlist options, playlist options become broadcast-ready program blocks, and future scheduler/broadcast tools publish those blocks to WOS streams.

---

## Current Product Model

```text
MUSIC
├── Library
│   ├── Catalog
│   ├── External
│   ├── Reference
│   ├── Crates
│   ├── Playlists
│   └── Sampler Banks
│
├── AudioLab
│   ├── Track Analysis
│   ├── Metadata Repair
│   ├── Slicing
│   ├── Stems
│   └── Playback Experiments
│
├── Scheduler
│   ├── Broadcast Events
│   ├── Upcoming
│   ├── Live
│   └── Archive
│
└── Broadcast
    ├── Title Screens
    ├── Countdown
    ├── Wall / Map Route
    ├── OBS / Twitch Package
    └── Social Kit
```

---

## Current Architecture

The active playlist-building model is:

```text
Catalog / External
→ Crates
→ Playlist Crate Pool
→ Playlist Path Options
→ Accepted Playlist Output
→ Flow Curve Proof View
→ Next Candidates
```

### Core Rules

```text
Crates provide the available music.
Playlist Path Options discover possible orders.
The user accepts one option as the Playlist Output.
The Flow Curve visualizes/proves the accepted path.
Next Candidates preserve unused crate tracks.
Metadata Readiness determines whether scores can be trusted.
```

---

## Library Areas

### Catalog

Catalog is the primary internal music library. Catalog tracks are expected to become the most trusted source for playlist generation because they can contain complete metadata:

```text
duration
BPM
key / Camelot key
energy
rating
mood/group/genre tags
file path / playable status
```

### External

External stores linked outside tracks and references that may be playlist-eligible once metadata is repaired.

External may initially be weak or provisional:

```text
missing BPM
missing energy
estimated duration
missing file path
fallback key
```

External tracks should pass through Metadata Completion or AudioLab analysis before being trusted for playlist path scoring.

### Reference

Reference is not a music-playlist source. It is for clips, SFX, field recordings, and material used by Sampler Banks.

```text
Reference → Sampler Banks
Catalog / External → Crates → Playlists
```

---

## Crates

Crates are reusable filtered candidate pools.

A crate answers:

```text
What music is eligible for this playlist or broadcast block?
```

Crates are intentionally broad and inclusive. They may include:

```text
duplicates
S01 variants
alternate versions
remixes
roughs
related track families
```

Duplicate handling belongs to Playlist / Flow Curve rules, not to crates.

---

## Playlists

A Playlist is an accepted arranged output from one or more selected crates.

A playlist can select multiple crates. The selected crates form the Playlist Crate Pool.

```text
Crate A + Crate B + Crate C
→ combined crate pool
→ generated path options
→ accepted playlist output
```

The user chooses one accepted path for the current playlist. Alternate strong options may be duplicated into new playlists.

---

## Playlist Path Options

Playlist Path Options generate multiple ranked possible orders from the same crate pool.

Instead of forcing tracks into one preset curve, MUSIC analyzes the crate pool and proposes multiple paths such as:

```text
Best Overall
Lowest Warnings
Smoothest Flow
Most Movement
Broadcast Arc
```

Each option can show:

```text
raw score
trust grade
track count
duration
warning count
crate usage
movement summary
score breakdown
warning breakdown
metadata readiness
```

Only one option becomes the active Playlist Output, but alternate options can be duplicated into additional playlists.

---

## Flow Curve

The Flow Curve remains important, but its role has changed.

Earlier model:

```text
Draw curve first
→ force tracks into curve
```

Current model:

```text
Generate path options from crate pool
→ accept one option
→ display the accepted path as a curve
```

The curve is now a proof view of the accepted playlist path. It should show:

```text
track nodes
warning states
hover/click inspectors
linked Playlist Output rows
energy movement
weak sections
```

The curve must prove the playlist, not decorate it.

---

## Metadata Readiness

Metadata Readiness determines whether playlist scores can be trusted.

Tracked fields include:

```text
duration
BPM
key
energy
title
artist
file path
rating
source owner
```

Trust labels:

```text
EXCELLENT
USABLE
PROVISIONAL
WEAK
BLOCKED
```

Core rule:

```text
Raw score ranks the generated path.
Trust grade tells whether the score can be believed.
```

A crate with missing duration/BPM/energy can still generate a provisional playlist, but it must not display as a trusted GOOD/EXCELLENT playlist.

---

## Metadata Completion

MUSIC includes a Metadata Completion workflow for repairing weak crates.

The workflow supports:

```text
readiness summary
missing metadata table
filters for missing duration/BPM/key/energy/path
bulk estimated duration actions
CSV metadata import
preview/apply metadata updates
readiness recalculation
```

Estimated values must remain clearly marked as estimated.

---

## AudioLab

AudioLab is the analysis and preparation workspace for MUSIC audio.

AudioLab should contain tools for:

```text
track analysis
duration/BPM/key/energy extraction
metadata repair exports
slice generation
stem separation
sampler-bank preparation
waveform and energy visualization
```

AudioLab feeds MUSIC. It does not replace the MUSIC Library.

Recommended relationship:

```text
AudioLab
→ creates analysis metadata

MUSIC Library
→ stores tracks, crates, playlists, sampler banks

MUSIC Playlist Options
→ uses analyzed metadata to generate trusted playlist paths
```

---

## Sampler Banks

Sampler Banks are performance/prep collections for Reference clips and future AudioLab slice outputs.

Sampler Banks are separate from music playlists.

```text
Reference clips
AudioLab slices
field recordings
SFX
loops
→ Sampler Banks
```

---

## Scheduler

Scheduler will turn accepted playlists into timed broadcast events.

Future scheduler model:

```text
Future
Present
Past
```

A scheduled broadcast event should eventually contain:

```text
playlist
optional sampler bank
title screen
countdown duration
WALL / map route
stream title
description
social copy
website archive status
replay links
```

---

## Broadcast

Broadcast will use a Send to Broadcast flow.

Target model:

```text
Playlist
→ Send to Broadcast
→ Broadcast Package
→ Countdown / Title Screen
→ OBS / Twitch
→ Scheduler Record
→ Website Archive
→ Social Post Kit
```

The browser app should not directly hold Twitch secrets, stream keys, or OBS credentials. OBS/Twitch control should eventually use a local controller.

---

## Current Build Notes

Recent completed milestones include:

```text
Crates as first-class collection
Playlist crate sources
Crate Pool / Playlist Output / Next Candidates views
Duplicate family rules
Legacy playlist filters removed from crate-controlled playlists
Fill From Crate / Generate Options workflow
Playlist Path Options
Warning proof view
Metadata readiness and duration repair
Metadata truth scoring
Metadata completion workflow
PLAY → MUSIC app/directory migration
```

Historical PLAY spec names are preserved for continuity.

---

## Naming Transition

```text
MUSIC = active product/app namespace
music/ = active implementation directory
PLAY = historical build/spec terminology
```

Do not rename internal TypeScript symbols such as `PlaylistRecord`, `PlayProject`, `playlistId`, or legacy spec filenames unless a separate migration explicitly scopes that work.

---

## Development

This app is built with React, TypeScript, and Vite.

Common commands:

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Note: the root `tsconfig.json` is solution-style (`"files": []` with `references`), so a bare `npx tsc --noEmit` silently checks nothing. `npm run typecheck` (`tsc --build tsconfig.json`) is the real check.

Run commands from:

```text
music/
```

---

## Source Truth

Active source files live in:

```text
music/
```

Current documentation/source-pack files should live in:

```text
WOS-share/MUSIC/
```

Historical PLAY reports/specs may remain archived under their original filenames.

---

## Working Principle

```text
MUSIC is the music intelligence layer of Wall of Sound.

It organizes tracks into crates,
turns crates into playlist options,
proves playlist quality through metadata and warning intelligence,
and prepares accepted playlists for future scheduler and broadcast workflows.
```
