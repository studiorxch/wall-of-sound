---
Project: Wall of Sound
File: BPMNormalize_v*.py
summary: >
  Detects BPM once per track, applies consistent time-stretching to all slices, and outputs normalized audio with ratio-based quality classification (CLEAN / FLEX / AMBIGUOUS).

started: April 25, 2026
---

# v1.2.0

✅ Computes BPM once per track (grouped by ID)
✅ Applies that BPM to all slices in the group
✅ Fixes your previous librosa scalar bug
✅ Exports CSV + JSON
✅ Keeps your current pipeline intact (no renaming assumptions beyond suffix)
