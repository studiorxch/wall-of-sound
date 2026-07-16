# 0629_WOS_syncwosspec_LIBRARY_MUSIC_COLORLAB_v1.0.0

```bash
#!/bin/zsh
# Sync MUSIC + COLORLAB + WALL specs/source files to Google Drive for ChatGPT/Claude sharing.
#
# Usage:
#   /Users/studio/Projects/wall-of-sound/tools/syncwosspec.sh
#   /Users/studio/Projects/wall-of-sound/tools/syncwosspec.sh --watch
#
# Modes:
#   once      Run one sync and exit.
#   --watch  Watch wall-of-sound for changes and auto-sync.

set -euo pipefail

MODE="${1:-once}"

PROJECTS_ROOT="/Users/studio/Projects"
WOS_ROOT="$PROJECTS_ROOT/wall-of-sound"
MUSIC_ROOT="$WOS_ROOT/music"
COLORLAB_ROOT="$WOS_ROOT/colorlab"
LIBRARY_MUSIC_ROOT="$WOS_ROOT/library/music"

GOOGLE_SHARE="/Users/studio/Library/CloudStorage/GoogleDrive-richardjlau@gmail.com/My Drive/chatGPT-share"

LOG_DIR="$HOME/Library/Logs"
SYNC_LOG="$LOG_DIR/syncwosspec.log"

DEBOUNCE_SECONDS=5

mkdir -p "$LOG_DIR"

log() {
  local message="$*"
  local timestamp

  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"

  echo "[$timestamp] $message"
  echo "[$timestamp] $message" >> "$SYNC_LOG"
}

assert_dir_exists() {
  local path="$1"
  local label="$2"

  if [[ ! -d "$path" ]]; then
    log "Missing directory for $label: $path"
    exit 1
  fi
}

assert_file_exists() {
  local path="$1"

  if [[ ! -f "$path" ]]; then
    log "Missing file: $path"
    exit 1
  fi
}

sync_folder() {
  local source="$1"
  local dest="$2"
  local label="$3"

  assert_dir_exists "$source" "$label"

  mkdir -p "$dest"

  log "Syncing $label"
  log "From: $source"
  log "To:   $dest"

  rsync -av --delete \
    --exclude ".DS_Store" \
    --exclude "node_modules/" \
    --exclude ".git/" \
    --exclude "dist/" \
    --exclude "build/" \
    --exclude ".vite/" \
    --exclude ".cache/" \
    --exclude "coverage/" \
    --exclude ".env" \
    --exclude ".env.*" \
    --exclude "*.log" \
    "$source/" "$dest/" >> "$SYNC_LOG" 2>&1

  log "Done: $label"
}

sync_library_music() {
  local source="$1"
  local dest="$2"
  local label="$3"

  assert_dir_exists "$source" "$label"

  mkdir -p "$dest"

  log "Syncing $label"
  log "From: $source"
  log "To:   $dest"

  rsync -av --delete \
    --exclude ".DS_Store" \
    --exclude ".git/" \
    --exclude "node_modules/" \
    --exclude "dist/" \
    --exclude "build/" \
    --exclude ".vite/" \
    --exclude ".cache/" \
    --exclude "coverage/" \
    --exclude ".env" \
    --exclude ".env.*" \
    --exclude "*.log" \
    --exclude "catalog/audio/" \
    --exclude "external/audio/" \
    --exclude "reference/audio/" \
    --exclude "*.aif" \
    --exclude "*.aiff" \
    --exclude "*.flac" \
    --exclude "*.m4a" \
    --exclude "*.mp3" \
    --exclude "*.ogg" \
    --exclude "*.wav" \
    --exclude "*.aac" \
    --exclude "*.alac" \
    --exclude "*.wma" \
    --exclude "*.jpg" \
    --exclude "*.jpeg" \
    --exclude "*.png" \
    --exclude "*.gif" \
    --exclude "*.webp" \
    --exclude "*.svg" \
    --exclude "*.tif" \
    --exclude "*.tiff" \
    --exclude "*.bmp" \
    --exclude "*.heic" \
    --exclude "*.mp4" \
    --exclude "*.mov" \
    --exclude "*.mkv" \
    --exclude "*.avi" \
    --exclude "*.webm" \
    --exclude "*.m4v" \
    "$source/" "$dest/" >> "$SYNC_LOG" 2>&1

  log "Done: $label"
}

sync_file_list() {
  local source_root="$1"
  local dest_root="$2"
  local label="$3"

  shift 3

  assert_dir_exists "$source_root" "$label"

  mkdir -p "$dest_root"

  log "Syncing $label"
  log "From: $source_root"
  log "To:   $dest_root"

  for relative_file in "$@"; do
    local source_file="$source_root/$relative_file"
    local dest_dir="$dest_root/$(dirname "$relative_file")"

    assert_file_exists "$source_file"

    mkdir -p "$dest_dir"

    rsync -av \
      --exclude ".DS_Store" \
      "$source_file" "$dest_dir/" >> "$SYNC_LOG" 2>&1
  done

  log "Done: $label"
}

run_sync() {
  log "Starting syncwosspec"

  assert_dir_exists "$WOS_ROOT" "WOS root"
  assert_dir_exists "$MUSIC_ROOT" "MUSIC root"
  assert_dir_exists "$COLORLAB_ROOT" "ColorLab root"
  assert_dir_exists "$LIBRARY_MUSIC_ROOT" "Library music root"

  # WOS source syncing
  sync_folder "$WOS_ROOT/wall" "$GOOGLE_SHARE/WOS/source/wall" "WALL source"
  sync_folder "$WOS_ROOT/shared" "$GOOGLE_SHARE/WOS/source/shared" "WOS shared source"
  sync_folder "$WOS_ROOT/data" "$GOOGLE_SHARE/WOS/source/data" "WOS data"
  sync_folder "$WOS_ROOT/studio" "$GOOGLE_SHARE/WOS/source/studio" "WOS studio source"

  # WOS-share syncing
  sync_folder "$WOS_ROOT/WOS-share" "$GOOGLE_SHARE/WOS-share" "WOS-SHARE"

  # LIBRARY music metadata/context syncing
  sync_library_music "$LIBRARY_MUSIC_ROOT" "$GOOGLE_SHARE/LIBRARY/MUSIC" "Library music"

  # MUSIC source syncing
  sync_folder "$MUSIC_ROOT/src" "$GOOGLE_SHARE/MUSIC/SOURCE/src" "MUSIC source"
  sync_folder "$MUSIC_ROOT/public" "$GOOGLE_SHARE/MUSIC/SOURCE/public" "MUSIC public assets"

  local music_files=(
    "vite.config.ts"
    "tsconfig.json"
    "tsconfig.app.json"
    "tsconfig.node.json"
    "eslint.config.js"
    "sample-tracks.csv"
    "package.json"
    "package-lock.json"
    "index.html"
    "README.md"
    "favicon.svg"
  )

  sync_file_list \
    "$MUSIC_ROOT" \
    "$GOOGLE_SHARE/MUSIC/SOURCE" \
    "MUSIC source files" \
    "${music_files[@]}"

  # COLORLAB source syncing
  sync_folder "$COLORLAB_ROOT/src" "$GOOGLE_SHARE/COLORLAB/SOURCE/src" "ColorLab source"
  sync_folder "$COLORLAB_ROOT/public" "$GOOGLE_SHARE/COLORLAB/SOURCE/public" "ColorLab public assets"

  local colorlab_files=(
    "vite.config.ts"
    "tsconfig.json"
    "tsconfig.app.json"
    "tsconfig.node.json"
    "eslint.config.js"
    "package.json"
    "package-lock.json"
    "index.html"
    "README.md"
  )

  sync_file_list \
    "$COLORLAB_ROOT" \
    "$GOOGLE_SHARE/COLORLAB/SOURCE" \
    "ColorLab source files" \
    "${colorlab_files[@]}"

  log "All selected folders synced to Google Drive"
}

assert_fswatch_available() {
  if ! command -v fswatch >/dev/null 2>&1; then
    log "fswatch is not installed. Install it with: brew install fswatch"
    exit 1
  fi
}

watch_sync() {
  assert_fswatch_available
  assert_dir_exists "$WOS_ROOT" "WOS watch root"

  log "Starting syncwosspec watcher"
  log "Watching root: $WOS_ROOT"
  log "Debounce: ${DEBOUNCE_SECONDS}s"
  log "Log file: $SYNC_LOG"

  run_sync

  fswatch -o \
    --exclude "/node_modules/" \
    --exclude "/.git/" \
    --exclude "/dist/" \
    --exclude "/build/" \
    --exclude "/.vite/" \
    --exclude "/.cache/" \
    --exclude "/coverage/" \
    --exclude "/.DS_Store$" \
    --exclude "/library/music/catalog/audio/" \
    --exclude "/library/music/external/audio/" \
    --exclude "/library/music/reference/audio/" \
    "$WOS_ROOT" | while read -r event_count; do

    echo ""
    echo "Change detected: $event_count filesystem event(s)"
    echo "Waiting ${DEBOUNCE_SECONDS}s before sync..."

    log "Detected $event_count filesystem event(s). Waiting ${DEBOUNCE_SECONDS}s before sync."

    sleep "$DEBOUNCE_SECONDS"

    run_sync

    echo "Auto-sync completed."
    log "Auto-sync completed after detected filesystem change."
  done
}

case "$MODE" in
  once)
    run_sync
    ;;
  --watch|watch)
    watch_sync
    ;;
  *)
    echo "Unknown mode: $MODE"
    echo "Usage:"
    echo "  /Users/studio/Projects/wall-of-sound/tools/syncwosspec.sh"
    echo "  /Users/studio/Projects/wall-of-sound/tools/syncwosspec.sh --watch"
    exit 1
    ;;
esac

```
