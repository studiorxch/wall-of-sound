---
layout: default
title: Sound System
domain: sound
---

# Sound System

## Current Pipeline

```txt
sound/data/sources/house/
→ sound/tools/bpm_normalize.py
→ sound/data/sources/house_124/
→ sound/tools/slicer.py
→ sound/data/slices/house_124/
→ sound/tools/demucs.py
→ sound/data/stems/
→ sound/engine/JUG_PLAYER_v1.7.1.py
```
