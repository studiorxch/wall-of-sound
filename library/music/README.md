---
date: 2026-07-06
title: MUSIC Artist Profile Library
version: 1.0.0
project: MUSIC_LIBRARY
status: draft
owner: StudioRich
purpose: Build a reusable artist intelligence library for translating music references into StudioRich playlists, prompts, visuals, archives, and WOS/world systems.
---

# MUSIC Artist Profile Library v1.0.0

## 1. Purpose

The Artist Profile Library is a structured reference system for capturing artists as creative intelligence, not as generic biographies.

The goal is to make artist research reusable across:

- StudioRich music archive notes
- playlist identity systems
- Suno / AI music prompt development
- WOS atmospheres and worldbuilding
- visual direction and playlist artwork
- song-aware listening notes
- future recommendation and programming systems

This library treats each artist as a source of **mechanisms**, **signals**, and **usable creative patterns**.

It should answer:

- What does this artist teach us?
- What sonic mechanisms are reusable?
- What playlist or channel identity does this artist support?
- What visual world does this artist suggest?
- What should StudioRich avoid copying directly?
- How can this reference become original StudioRich output?

## 2. Core Principle

Artist profiles should not become basic music encyclopedia entries.

A weak profile says:

> Artist X is a producer known for minimal techno, ambient, and experimental music.

A useful StudioRich profile says:

> Artist X uses slow repetition, dry percussion, deep negative space, and long-form micro-variation to create tracks that feel like infrastructure breathing under a city grid.

The library should prioritize **translation value** over trivia.

## 3. Library Position

Recommended location:

```text
MUSIC_LIBRARY/
├── ARTISTS/
├── ALBUMS/
├── TRACKS/
├── PLAYLIST_REFERENCES/
├── PROMPT_SKELETONS/
└── README.md
```

If mirrored into `chatGPT-share`, keep it lightweight and current-facing:

```text
chatGPT-share/
└── MUSIC-share/
    ├── ARTISTS/
    ├── ALBUMS/
    ├── TRACKS/
    ├── PLAYLIST_REFERENCES/
    ├── PROMPT_SKELETONS/
    └── README.md
```

The `chatGPT-share` version should act as a working shelf, not the permanent archive. It should expose the current active library context to ChatGPT, Claude, Obsidian, and project collaborators.

## 4. Recommended Folder Structure

```text
MUSIC_LIBRARY/
├── ARTISTS/
│   ├── Ricardo_Villalobos.md
│   ├── Audio_Werner.md
│   ├── DJ_Koze.md
│   ├── Sascha_Dive.md
│   └── Willow.md
│
├── ALBUMS/
│   ├── Audio_Werner_Abundance_Pt_2_2021.md
│   └── ...
│
├── TRACKS/
│   ├── Artist_Title.md
│   └── ...
│
├── PLAYLIST_REFERENCES/
│   ├── deep-minimal-loop-system.md
│   ├── dub-infrastructure.md
│   ├── memory-sector.md
│   └── ...
│
├── PROMPT_SKELETONS/
│   ├── microhouse-negative-space.md
│   ├── dub-techno-fog-grid.md
│   ├── atmospheric-bass-infrastructure.md
│   └── ...
│
└── README.md
```

## 5. Relationship Between Layers

### 5.1 Artist Profiles

Artist profiles are the top-level reference layer.

They define:

- artist identity
- core sound
- production mechanisms
- archive relevance
- StudioRich translation value
- playlist/channel fit
- prompt-use value
- visual/worldbuilding signals

### 5.2 Album Notes

Album notes capture a specific body of work.

They define:

- album identity
- sonic palette
- track-to-track movement
- arrangement logic
- emotional temperature
- standout mechanisms
- StudioRich translation notes

### 5.3 Track Notes

Track notes are the most detailed listening layer.

They define:

- tempo / rhythmic feel
- drum behavior
- bass behavior
- atmosphere
- arrangement map
- memorable transitions
- mix-space behavior
- prompt skeleton potential
- playlist placement

### 5.4 Playlist References

Playlist reference notes turn artists, albums, and tracks into programmable channel identities.

They define:

- playlist name
- emotional range
- reference artists
- visual direction
- time-of-day fit
- countdown/intro behavior
- stream/channel use
- WOS atmosphere relationship

### 5.5 Prompt Skeletons

Prompt skeletons convert archive intelligence into reusable AI music prompts.

They should be reference-safe and original. They should not request a direct imitation of any artist.

## 6. Artist Profile Template

Use this template for every artist profile.

```markdown
---
type: artist_profile
artist: Artist Name
slug: artist-name
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
origin: City / Region / Country
active_years: YYYY-present
primary_styles:
  - style-one
  - style-two
labels:
  - Label Name
links:
  website:
  instagram:
  bandcamp:
  soundcloud:
  youtube:
  spotify:
rating:
studiorich_relevance: high | medium | low
---

# Artist Name

## 1. Identity

Brief identity summary focused on why this artist matters to the archive.

## 2. Core Sound

Describe the artist's sound in usable terms.

Focus on:

- rhythm
- bass
- texture
- space
- repetition
- arrangement
- emotional tone

## 3. Sonic Mechanisms

List reusable mechanisms.

| Mechanism | Description | StudioRich Use |
|---|---|---|
| Negative space | Sparse arrangement leaves room around percussion and bass. | Useful for loop-safe playlist beds and WOS night movement. |

## 4. Production Signals

Capture practical production traits.

- Drum behavior:
- Bass behavior:
- Loop behavior:
- Texture behavior:
- Arrangement behavior:
- Mix-space behavior:

## 5. Visual / Worldbuilding Signals

Describe what kind of visual world the artist suggests.

Examples:

- underground transit
- fogged infrastructure
- late-night radio
- warehouse air
- city grid repetition
- underwater signal network
- archival dust
- machine room warmth

## 6. Key Works

| Work | Year | Type | Why It Matters |
|---|---:|---|---|
| Title | YYYY | album / EP / track | Short note. |

## 7. Playlist Fit

Recommended playlist/channel uses.

- overnight stream
- morning grid
- memory sector
- subway drift
- dub infrastructure
- minimal motion
- route countdown

## 8. Prompt-Use Notes

Reference-safe translation notes for AI music generation.

Do not write: "make a track like Artist Name."

Write: "Create a restrained minimal electronic composition using dry percussion, long-form repetition, deep sub movement, and subtle micro-variation."

## 9. StudioRich Translation

Explain how this artist can inform original StudioRich output.

## 10. Avoid

List direct-copy risks.

- Do not copy specific melodies.
- Do not reuse recognizable track structures too closely.
- Do not lean on artist name as the prompt engine.
- Do not reduce the artist to genre tags only.

## 11. Tags

- tag-one
- tag-two
- tag-three
```

## 7. Album Note Template

```markdown
---
type: album_note
artist: Artist Name
album: Album Title
year: YYYY
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
primary_styles:
  - style-one
  - style-two
studiorich_relevance: high | medium | low
---

# Artist Name — Album Title

## 1. Album Identity

What the album is and why it matters.

## 2. Sonic Palette

- drums:
- bass:
- atmosphere:
- melody/harmony:
- samples/field recordings:
- mix-space:

## 3. Track Movement

Describe how the album moves from beginning to end.

## 4. Key Mechanisms

| Mechanism | Where It Appears | StudioRich Use |
|---|---|---|
| Long-form drift | Several tracks | Useful for stream continuity. |

## 5. Standout Tracks

| Track | Function | Notes |
|---|---|---|
| Track Title | opener / bridge / peak / outro | Short note. |

## 6. Playlist Placement

Where this album belongs in StudioRich programming.

## 7. Prompt Skeleton Potential

Convert the album into reference-safe creative instructions.

## 8. Archive Links

- Artist profile:
- Related playlists:
- Related prompt skeletons:
```

## 8. Track Note Template

```markdown
---
type: track_note
artist: Artist Name
track: Track Title
release:
year: YYYY
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
studiorich_relevance: high | medium | low
---

# Artist Name — Track Title

## 1. Track Function

What role this track plays.

Examples:

- opener
- transition
- peak restraint
- loop bed
- fog layer
- bass reference
- countdown reference
- route-motion cue

## 2. Listening Map

| Time | Event | Notes |
|---:|---|---|
| 0:00 | Intro texture | Short note. |
| 1:30 | Bass enters | Short note. |

## 3. Rhythm Behavior

Describe groove, swing, density, and percussion logic.

## 4. Bass Behavior

Describe bass tone, movement, pressure, and restraint.

## 5. Atmosphere / Texture

Describe environmental, synthetic, or acoustic texture.

## 6. Arrangement Logic

Describe how the track evolves without relying only on drops or verse/chorus structure.

## 7. StudioRich Use

How this track can inform original work.

## 8. Prompt Skeleton

Reference-safe prompt draft.

## 9. Tags

- tag-one
- tag-two
```

## 9. Playlist Reference Template

```markdown
---
type: playlist_reference
playlist: Playlist Name
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
primary_function: stream | archive | youtube | wos | prompt-development
---

# Playlist Name

## 1. Identity

Describe the playlist as a channel, room, zone, or broadcast identity.

## 2. Reference Artists

| Artist | Contribution |
|---|---|
| Artist Name | Dry minimal rhythm, negative space, long-form repetition. |

## 3. Sonic Rules

- tempo range:
- drum density:
- bass behavior:
- atmosphere:
- vocal policy:
- transition behavior:

## 4. Visual Rules

- image format:
- color palette:
- moodboard direction:
- type behavior:
- WOS atmosphere relationship:

## 5. Programming Use

- time-of-day:
- stream length:
- countdown use:
- transition use:
- route/map pairing:

## 6. Prompt Direction

Reference-safe prompt direction for generating original tracks.
```

## 10. Prompt Skeleton Template

```markdown
---
type: prompt_skeleton
name: Prompt Skeleton Name
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_profiles:
  - Artist Name
  - Artist Name
use_case: suno | playlist | soundtrack | wos | countdown
---

# Prompt Skeleton Name

## 1. Intent

What this prompt is designed to generate.

## 2. Reference Translation

Describe the influence without asking for imitation.

## 3. Prompt

Create a [duration / format] instrumental composition using [rhythm], [bass behavior], [texture], [atmosphere], and [arrangement logic]. The piece should feel like [world / environment / function], emphasizing [core mechanism] over [thing to avoid].

## 4. Negative Constraints

- no vocals
- no direct artist imitation
- no recognizable melody references
- no aggressive drop unless required
- no overproduced EDM structure unless required

## 5. Use Notes

Where this prompt belongs in the StudioRich system.
```

## 11. Metadata Rules

### 11.1 Artist Naming

File format:

```text
Artist_Name.md
```

Examples:

```text
Ricardo_Villalobos.md
Audio_Werner.md
DJ_Koze.md
Sascha_Dive.md
```

### 11.2 Album Naming

File format:

```text
Artist_Name_Album_Title_YYYY.md
```

Example:

```text
Audio_Werner_Abundance_Pt_2_2021.md
```

### 11.3 Track Naming

File format:

```text
Artist_Name_Track_Title.md
```

If multiple versions exist, append year or version.

```text
Artist_Name_Track_Title_Original_Mix.md
Artist_Name_Track_Title_2004.md
```

## 12. Workflow

## 12.1 Fast Artist Intake

Use this when the user gives only an artist name.

1. Create or update an artist profile.
2. Prioritize StudioRich relevance over biography.
3. Capture sonic mechanisms.
4. Add playlist fit.
5. Add prompt-use notes.
6. Provide a downloadable `.md` link.

## 12.2 Artist + Link Intake

Use this when the user provides an artist name and links.

1. Verify official links when possible.
2. Add links to frontmatter.
3. Summarize identity.
4. Extract mechanisms.
5. Add StudioRich translation.
6. Provide a downloadable `.md` link.

## 12.3 Album Intake

Use this when the user gives an album title, link, or uploaded PDF/metadata.

1. Create album note.
2. Connect to artist profile.
3. Capture sonic palette.
4. Identify standout mechanisms.
5. Add playlist and prompt value.
6. Provide a downloadable `.md` link.

## 12.4 Track Intake

Use this when the user gives a song title.

1. Create track note.
2. Map arrangement and function.
3. Capture rhythm, bass, atmosphere, and texture.
4. Translate into StudioRich use.
5. Add prompt skeleton.
6. Provide a downloadable `.md` link.

## 13. First Library Seed

Start with artists already appearing in current StudioRich archive conversations:

- Audio Werner
- Sascha Dive
- Willow
- DJ Koze
- Ricardo Villalobos
- Madlib
- Knxwledge
- idealism
- potsu
- jinsang
- Flying Lotus
- Pete Rock
- Aphex Twin

Suggested first build order:

1. Audio Werner
2. Ricardo Villalobos
3. DJ Koze
4. Sascha Dive
5. Willow
6. Aphex Twin
7. Flying Lotus
8. Madlib

## 14. Quality Bar

A profile is complete enough when it can generate at least three useful outputs:

1. A playlist direction
2. A reference-safe AI music prompt
3. A visual/worldbuilding direction

If a profile cannot produce those, it is still only a reference stub.

## 15. Example Output Logic

Given:

```text
Ricardo Villalobos
```

The archivist should produce:

```text
ARTISTS/Ricardo_Villalobos.md
```

With:

- identity summary
- core sound
- sonic mechanisms
- key works
- playlist fit
- StudioRich translation
- prompt-use notes
- direct-copy warnings

The assistant should not ask what to do unless the user explicitly requests a different output.

## 16. Implementation Notes

This library should be designed for continuous iteration.

Do not wait for perfect research before creating a profile. Create a useful draft, then deepen it through albums, tracks, playlists, and listening notes.

Every artist note should eventually become a node that connects to:

- albums
- tracks
- playlists
- prompt skeletons
- visual systems
- WOS atmosphere states
- StudioRich original compositions

## 17. Implementation Guide

- **Where**: Add this file at `MUSIC_LIBRARY/README.md` or mirror it to `chatGPT-share/MUSIC-share/README.md`. Artist profiles should go in `MUSIC_LIBRARY/ARTISTS/`.
- **What**: Create folders with `mkdir -p MUSIC_LIBRARY/{ARTISTS,ALBUMS,TRACKS,PLAYLIST_REFERENCES,PROMPT_SKELETONS}` and copy this README into the root.
- **Expect**: New artist names can now be converted directly into structured profile notes with reusable playlist, prompt, visual, and WOS translation sections.
