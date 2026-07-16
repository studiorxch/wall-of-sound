# Track Pool Analyzer — 0618B_v1.0.0

Scans a folder of audio files, extracts BPM / key / energy metadata, and exports a CSV ready to import into the Flow Curve Playlist Builder.

## Setup

```bash
cd ../tools/track-pool-analyzer
python3 -m venv .venv
.venv/bin/pip install librosa soundfile numpy scipy mutagen tqdm
```

## Usage

```bash
.venv/bin/python analyze_folder.py \
  --input "/Users/studio/Music/_INBOX/Playlists : Mixes/VA-Microhouse-Essentials-2021" \
  --output "./Microhouse_Essentials_2021.csv"
```

### All options

```
--input              Path to audio folder (required)
--output             Output CSV path (default: real-track-pool.csv)
--recursive          Scan subfolders (default: true)
--artist-fallback    Artist name when tags are missing (default: Unknown Artist)
--analysis-version   Version tag written to CSV rows
--overwrite          Overwrite existing output file
```

## Supported formats

`.mp3` `.wav` `.aiff` `.aif` `.flac` `.m4a` `.ogg`

## Output

CSV with Flow Curve Builder-compatible columns first (`title`, `artist`, `bpm`, `camelotKey`, `durationSeconds`, `energy`, `filePath`), then full analyzer metadata.

Import `real-track-pool.csv` directly into **Import CSV Track Pool** in the Flow Curve Builder.
