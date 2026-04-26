---
project: Wall of Sound
category: audio
files_modified:
source venv/bin/activate
python /Users/studio/Projects/wall-of-sound/sound/tools/slicer.py
python /Users/studio/Projects/wall-of-sound/sound/tools/bpm_normalize.py

status: "in progress"
next:

summary: >
---

# github:

git add .
git commit -m "sound updated"
git push

# pipeline

./pipeline.sh # Build audio system
./run.sh # Run live engine

# directory structure

tools/ → generates structure
engine/ → interprets structure
data/ → shared truth

# execution

- always run from sound/
- no path confusion
- no cross-system bleed into wall/

# Technical Notes

tree -I "venv"

# Change Log (high-level)

changes:
