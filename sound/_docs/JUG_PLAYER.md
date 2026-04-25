---
Project: Wall of Sound
File: AUDIO_JUG_PLAYER_v*.py
Summary: >
blah, blah, blah

Date: April 24, 2026
---

# v1.3.0

🎧 Playback Behavior

- Plays 8-bar slices continuously
- Every 16 bars → evaluates swap
- Chooses best next slice based on:
- groove match
- section continuity (mode dependent)
- energy similarity
- novelty (no repeats)

stable

- Feels like a cohesive track
- Minimal jumps
- Good for streaming
  explore
- Looser structure
- Finds unexpected transitions
- Good for discovery
  performance
- Same as stable (for now)
- Later → bias toward peaks

🧪 What to Listen For

- Does it “hold a vibe”?
- Do transitions feel natural?
- Does it avoid obvious repetition?
- Does energy drift or stay locked?

⚠️ Known Limits (intentional)

- No crossfade yet (hard cuts)
- No BPM drift handling
- No key filtering yet
- No stems (but structure supports it)
- guesswork

# v1.3.1

- continuous audio
- no 14-second dropouts
- consistent looping
- transitions feel connected

# v1.3.2 — Crossfade Engine

- overlap slices (50–200ms)
- remove transient clicks completely
- DJ-like transitions

# v1.3.3 — Micro Variation Engine

- Per-slice subtle variation:
- Gain drift (±1–2 dB)
- Micro pitch drift (±3 cents)
- Optional timing jitter (very small)
- Deterministic per slice → stable but not identical

# v1.3.4 — Adaptive Variation (Human)

- repetition becomes harder to detect
- loops feel like they’re “breathing”
- subtle tonal drift over time
- less mechanical, more organic

# v1.4.0— Layered Engine

- drums feel stable (anchor)
- bass shifts occasionally
- melody evolves more freely
- feels closer to a real track

# v1.4.1—upgraded player

- stem gain staging
- no pitch shift on drums
- normalized mix (no clipping)
- smarter slice rotation (no immediate repeats)
- stronger buffering
- cleaner variation handling

Before

- muddy layering
- random repetition
- occasional clipping
- unstable playback under load
  After
- cleaner mix (proper gain staging)
- smoother transitions
- less repetition fatigue
- more stable streaming

# v1.7.1

- Playback history tracking
- Waveform timeline stitching
- Energy curve plotting
- Safe debug trigger (non-invasive)
- Your full engine preserved
