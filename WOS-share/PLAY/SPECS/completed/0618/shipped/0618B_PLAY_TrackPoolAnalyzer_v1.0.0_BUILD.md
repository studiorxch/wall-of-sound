# 0618B_PLAY_TrackPoolAnalyzer_v1.0.0_BUILD

## Project

**Project Title:** 0618B_PLAY_TrackPoolAnalyzer_v1.0.0_BUILD  
**Purpose:** Build a local audio-folder analyzer that scans real audio files, extracts BPM/key/duration/energy metadata, converts key to Camelot format, and exports a CSV that imports directly into `0618A_PLAY_FlowCurvePlaylistBuilder`.

---

## Environmental Assumptions

- Runtime: local Python CLI.
- Target OS: macOS first; should remain portable where possible.
- Input: a folder containing real audio files.
- Output: a Flow Curve-compatible `.csv`.
- The React Flow Curve Builder remains metadata-first and does not analyze audio directly.
- This build may use audio analysis libraries; it must not add playback, waveform UI, OBS, mixer controls, or transition automation.
- Required Python version: 3.10+.
- Recommended dependencies:
  - `librosa`
  - `soundfile`
  - `numpy`
  - `scipy`
  - `mutagen`
  - `pandas` or Python `csv`
  - `tqdm` optional for progress display

---

## Source Material To Reuse

Use the prior analyzer work as the foundation:

- `analyze_audio.py`
- `0613A_PLAY_BPM_Key_Cleanup_v1.0.0_BUILD`
- `0613B_PLAY_Energy Engine_v1.0.0_BUILD`

Do not revive the full older Playlist Engineering stack yet. This build only creates the real-audio CSV required to test the Flow Curve Builder.

---

## Objective

Create:

```text
tools/track-pool-analyzer/analyze_folder.py
```

The script must scan a folder of audio files and generate:

```text
real-track-pool.csv
```

compatible with the Flow Curve Builder import format.

---

## Supported Audio Extensions

```text
.mp3
.wav
.aiff
.aif
.flac
.m4a
.ogg
```

The scan should be recursive by default.

---

## CLI Usage

```bash
python tools/track-pool-analyzer/analyze_folder.py \
  --input "/path/to/audio/folder" \
  --output "./real-track-pool.csv"
```

Optional arguments:

```bash
--recursive true
--artist-fallback "Unknown Artist"
--analysis-version "0618B_v1.0.0"
--overwrite
```

---

## Output CSV Columns

The first columns must stay compatible with the current Flow Curve Builder:

```csv
title,artist,bpm,camelotKey,durationSeconds,energy,filePath
```

Then append richer metadata:

```csv
actual_bpm,bpm_confidence,actual_key,key_confidence,camelot,tempo_family,energy_score,energy_level,rms_mean,rms_peak,dynamic_range,onset_density,transient_density,spectral_centroid,spectral_rolloff,zero_crossing_rate,brightness,density,sample_rate,channels,beats_detected,analysis_version
```

Full header:

```csv
title,artist,bpm,camelotKey,durationSeconds,energy,filePath,actual_bpm,bpm_confidence,actual_key,key_confidence,camelot,tempo_family,energy_score,energy_level,rms_mean,rms_peak,dynamic_range,onset_density,transient_density,spectral_centroid,spectral_rolloff,zero_crossing_rate,brightness,density,sample_rate,channels,beats_detected,analysis_version
```

---

## Data Contract

### Required Import Compatibility Fields

| Field | Type | Notes |
|---|---|---|
| `title` | string | Tag first, filename fallback |
| `artist` | string | Tag first, filename fallback |
| `bpm` | number | Alias of `actual_bpm` for Flow Curve Builder |
| `camelotKey` | string | Alias of `camelot` for Flow Curve Builder |
| `durationSeconds` | number | Float or integer seconds |
| `energy` | number | Normalized `0.0–1.0` |
| `filePath` | string | Absolute local path |

### Analyzer Fields

| Field | Type | Notes |
|---|---|---|
| `actual_bpm` | number | Detected tempo after cleanup |
| `bpm_confidence` | number | `0.0–1.0` |
| `actual_key` | string | Example: `A minor`, `C major` |
| `key_confidence` | number | `0.0–1.0` |
| `camelot` | string | Example: `8A`, `8B` |
| `tempo_family` | string | `slow`, `mid`, `fast`, `double_time_candidate`, etc. |
| `energy_score` | number | `0–100` |
| `energy_level` | integer | `1–5` |
| `rms_mean` | number | Average RMS loudness |
| `rms_peak` | number | Peak RMS value |
| `dynamic_range` | number | Loud/quiet contrast proxy |
| `onset_density` | number | Onsets per minute |
| `transient_density` | number | Transient intensity/frequency proxy |
| `spectral_centroid` | number | Brightness proxy |
| `spectral_rolloff` | number | High-frequency rolloff |
| `zero_crossing_rate` | number | Noisiness/percussiveness proxy |
| `brightness` | number | Normalized `0.0–1.0` |
| `density` | number | Normalized `0.0–1.0` |
| `sample_rate` | number | Audio sample rate |
| `channels` | number | Channel count |
| `beats_detected` | number | Count of beat frames |
| `analysis_version` | string | Example: `0618B_v1.0.0` |

---

## Metadata Extraction Rules

### Title / Artist

Read tags with `mutagen` where possible.

Priority:

```text
1. Embedded title + artist tags
2. Filename pattern: Artist - Title.ext
3. title = filename stem, artist = Unknown Artist
```

Normalize whitespace and remove extension artifacts.

### Duration / Sample Rate / Channels

Use `soundfile.SoundFile` first where possible.  
Fallback to `librosa.get_duration()` after loading.

### File Path

Preserve absolute resolved path.

---

## BPM Detection

Use `librosa.beat.beat_track`.

Required behavior:

1. Detect tempo.
2. Count beat frames.
3. Generate `bpm_confidence`.
4. Correct obvious half-time / double-time errors.

### BPM Cleanup Rules

Normalize detected BPM into a practical playlist range where possible.

Suggested working range:

```text
70–150 BPM
```

If detected BPM is below range, test double-time:

```text
bpm * 2
```

If detected BPM is above range, test half-time:

```text
bpm / 2
```

Keep the version that best fits the expected range while preserving confidence.

### Tempo Family

Suggested mapping:

| BPM | tempo_family |
|---:|---|
| `< 80` | `slow` |
| `80–105` | `low_mid` |
| `106–124` | `mid` |
| `125–140` | `dance` |
| `> 140` | `fast` |

---

## Key Detection

Use chroma analysis.

V1 must detect:

```text
major / minor
```

not just pitch class.

### Required Output

```text
actual_key: A minor
camelot: 8A
key_confidence: 0.0–1.0
```

### Camelot Mapping

| Key | Camelot |
|---|---|
| A minor | 8A |
| E minor | 9A |
| B minor | 10A |
| F# minor | 11A |
| C# minor | 12A |
| G# minor | 1A |
| D# minor / Eb minor | 2A |
| A# minor / Bb minor | 3A |
| F minor | 4A |
| C minor | 5A |
| G minor | 6A |
| D minor | 7A |
| C major | 8B |
| G major | 9B |
| D major | 10B |
| A major | 11B |
| E major | 12B |
| B major | 1B |
| F# major / Gb major | 2B |
| C# major / Db major | 3B |
| G# major / Ab major | 4B |
| D# major / Eb major | 5B |
| A# major / Bb major | 6B |
| F major | 7B |

### Confidence

Estimate key confidence from the separation between the best key profile score and second-best score.

If confidence is low, still output the best estimate but keep `key_confidence` low.

---

## Energy Engine

Use the 0613B Energy Engine direction.

Generate:

```text
energy_score: 0–100
energy_level: 1–5
energy: 0.0–1.0
```

### Core Metrics

Calculate:

```text
rms_mean
rms_peak
dynamic_range
onset_density
transient_density
spectral_centroid
spectral_rolloff
zero_crossing_rate
brightness
density
```

### Energy Formula

Use a deterministic weighted formula.

Suggested first version:

```text
energy_score =
  25% normalized_rms_mean
+ 15% normalized_rms_peak
+ 15% normalized_onset_density
+ 15% normalized_transient_density
+ 10% normalized_bpm
+ 10% normalized_brightness
+ 10% normalized_density
```

Clamp output to `0–100`.

Then:

```text
energy = energy_score / 100
```

### Energy Level Mapping

```text
0–20   -> 1
21–40  -> 2
41–60  -> 3
61–80  -> 4
81–100 -> 5
```

---

## Error Handling

The analyzer must not fail the entire batch because one file fails.

For each failed file:

- Print a readable warning.
- Add it to a failed summary.
- Continue processing the next file.

If a field cannot be detected:

- Use blank value only as last resort.
- Preserve filePath.
- Continue writing the row only if at least title, artist, duration, and filePath exist.

---

## Summary Output

After processing, print:

```text
Track Pool Analyzer complete
Total files scanned:
Valid audio files:
Rows written:
Failed files:
BPM detected:
Key detected:
Average BPM confidence:
Average key confidence:
Output CSV:
```

---

## Acceptance Criteria

The build is complete when:

1. A folder of audio files can be scanned from CLI.
2. The analyzer recursively finds supported audio files.
3. Each valid track receives title, artist, duration, and filePath.
4. BPM is detected and cleaned for half-time/double-time obvious errors.
5. Major/minor key is estimated.
6. Camelot key is generated.
7. Energy score `0–100` is generated.
8. Energy level `1–5` is generated.
9. Energy normalized `0.0–1.0` is generated.
10. CSV imports into the Flow Curve Builder without breaking.
11. Failed files do not stop the batch.
12. Summary output is printed.

---

## Non-Goals

Do not build:

- audio playback
- waveform UI
- beatgrid editor
- transition timing
- crossfading
- OBS overlay
- Mixxx API integration
- AI mood classification
- the full 0613A–0613O playlist engineering system

---

## Implementation Guide

- **Where:** Create `tools/track-pool-analyzer/analyze_folder.py` inside the Flow Curve Builder project.
- **What:** Install Python dependencies, then run the CLI against a real audio folder.
- **Expect:** A complete `real-track-pool.csv` containing BPM, Camelot key, duration, normalized energy, full energy metadata, confidence values, and file paths ready for Flow Curve import.
