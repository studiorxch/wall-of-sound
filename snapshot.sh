#!/bin/bash
# A simple script to create a snapshot of all changed files in the current git repository.
# Usage: ./snapshot.sh [label]

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

LABEL=$1

if [ -z "$LABEL" ]; then
  LABEL="snapshot"
fi

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
SNAPSHOT_DIR="$ROOT/snapshots/${TIMESTAMP}_${LABEL}"

echo "Creating snapshot..."
mkdir -p "$SNAPSHOT_DIR"

# Modified tracked files
CHANGED_FILES=$(git diff --name-only)

# Staged files
STAGED_FILES=$(git diff --cached --name-only)

# Untracked files
UNTRACKED_FILES=$(git ls-files --others --exclude-standard)

# Merge + dedupe
FILES=$(printf "%s\n%s\n%s\n" \
  "$CHANGED_FILES" \
  "$STAGED_FILES" \
  "$UNTRACKED_FILES" | sort -u)

if [ -z "$FILES" ]; then
  echo "No changed files detected."
  exit 0
fi

echo "$FILES" | while read FILE; do
  if [ -f "$FILE" ]; then
    DEST="$SNAPSHOT_DIR/$(dirname "$FILE")"
    mkdir -p "$DEST"
    cp "$FILE" "$DEST/"
    echo "Saved: $FILE"
  fi
done

# Cleanup snapshots older than 7 days
find "$ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

echo ""
echo "Snapshot complete:"
echo "$SNAPSHOT_DIR"