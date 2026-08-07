# Glyph Audio — Repository Context and Safety

## Repository

```text
wall-of-sound/
```

## Product placement

Glyph lives inside MUSIC under AudioLab, beside Looper.

```text
MUSIC
└── AUDIOLAB
    ├── Looper
    └── Glyph
```

There is no standalone `apps/audiolab-glyph/` application.

## Preserved reference application

```text
apps/glyphlab-reference/
```

Reference commit:

```text
79e5c4c Add GlyphLab reference implementation
```

GlyphLab is read-only historical evidence and a parts donor. Do not modify it or import it as a live dependency.

## Documentation

```text
docs/glyph-audio/
```

## Approved production areas

```text
music/src/data/glyph*.ts
music/src/logic/glyph/
music/src/ui/glyph/
```

Approved additive changes to existing MUSIC files are defined in:

- `13_GLYPH_AUDIO_Consolidated_Implementation_Plan.md`
- `14_GLYPH_AUDIO_Approved_Decisions.md`

## Existing systems to inspect and reuse

- Looper for AudioLab registration and music input;
- TrackInspector for "Open in Glyph";
- MUSIC track identity, playback, transport, analysis, and persistence;
- Orb for controls tied to a live preview;
- Geographic for preview-over-collection layout;
- GlyphLab for stroke/path/editor concepts.

## Working-tree risk

The repository contains unrelated active work, including MAPS, itinerary, orb, overlay, vehicle, render, and stem changes.

These files are not part of Glyph.

## Prohibited Git operations

Do not run:

```text
git reset
git reset --hard
git clean
git restore .
git checkout .
git add .
git add -A
git commit
git rebase
git stash
```

unless the user explicitly requests the exact operation after reviewing repository status.

## Allowed read-only Git inspection

```text
git status --short
git diff -- <approved-path>
git diff --cached -- <approved-path>
git log --oneline -- <approved-path>
git show <commit> -- <approved-path>
```

## Data safety

Do not:

- delete source audio;
- rewrite TrackStemLibrary files;
- move library imports;
- normalize or rename unrelated assets;
- migrate global storage;
- change root workspace configuration;
- create a `packages/` architecture.

## Build order

```text
Data layer
→ Logic layer
→ Interface
```

No interface-first implementation.

## First Claude implementation task

Before writing code, amend the exact TypeScript models and file plan using `14_GLYPH_AUDIO_Approved_Decisions.md`.

Then implement only the approved first slice.
