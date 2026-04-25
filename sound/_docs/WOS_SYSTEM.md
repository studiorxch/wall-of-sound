---
project: Wall of Sound
category: audio
files_modified:

next:

summary: >
---

# github:

git add .gitignore
git commit -m "gitignore updated"
git push

# Build audio system

./pipeline.sh

# Run live engine

./run.sh

# directory structure

tools/ → generates structure
engine/ → interprets structure
data/ → shared truth

# execution

Stable execution

- always run from sound/
- no path confusion
- no cross-system bleed into wall/

# Change Log

# April 24
