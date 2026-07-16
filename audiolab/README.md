# AudioLab

AudioLab prepares audio metadata and analysis exports for MUSIC.

---

## What AudioLab Is

AudioLab is a local analysis workspace that sits next to the MUSIC library app.

```
AudioLab analyzes audio files
→ exports CSV / JSON
→ MUSIC Metadata Completion imports the file
→ user previews and applies selected updates
→ crate readiness improves
→ playlist path options become trusted
```

AudioLab does not store tracks. It does not modify the MUSIC library directly. It produces analysis exports that the user imports through the MUSIC UI.

---

## How It Relates to MUSIC

```
AudioLab         → analysis workspace
MUSIC Library    → tracks, crates, playlists, sampler banks
MUSIC Scheduler  → broadcast scheduling
```

AudioLab feeds MUSIC. It does not replace MUSIC.

---

## Running Analysis

### Analyze a folder

```bash
./audiolab/bin/analyze_external.sh /path/to/audio/folder
```

### Analyze individual files

```bash
./audiolab/bin/analyze_external.sh file1.flac file2.mp3 file3.wav
```

The script creates a local venv on first run, installs dependencies from `requirements.txt`, analyzes all valid audio files, and writes output.

### Supported formats

`.wav` · `.flac` · `.mp3` · `.aiff` · `.aif` · `.m4a` · `.ogg`

---

## Where Outputs Go

```
audiolab/output/
├── analysis-json/
│   ├── music_analysis_YYYYMMDD_HHMMSS.json
│   └── latest.json
├── analysis-csv/
│   ├── music_analysis_YYYYMMDD_HHMMSS.csv
│   └── latest.csv
└── reports/
    ├── music_analysis_report_YYYYMMDD_HHMMSS.md
    └── latest.md
```

`latest.*` aliases are always overwritten with the most recent run.

---

## Importing Outputs into MUSIC

1. Open MUSIC → navigate to a playlist with a crate pool.
2. Click **Fix Metadata** in the readiness row.
3. Click **Import CSV…** in the Metadata panel.
4. Select `audiolab/output/analysis-csv/latest.csv`.
5. Review the import preview — which tracks matched, what fields will update.
6. Click **Apply**.
7. Crate pool readiness recalculates.

---

## Analysis Fields Produced

| Field | Description |
|---|---|
| `durationSeconds` | Real duration from audio file |
| `bpm` | librosa tempo detection |
| `key` | Chroma-based key estimation |
| `camelotKey` | Camelot wheel notation (null if mode ambiguous) |
| `energy` | Composite estimate: RMS + onset + centroid + tempo (0.0–1.0) |
| `sampleRate` | Sample rate in Hz |
| `channels` | Channel count |
| `beatsDetected` | Beat frame count from librosa |

See `docs/AUDIO_ANALYSIS_FORMAT.md` for the full schema and field notes.

---

## What Is Not Implemented Yet

- Browser-side audio analysis (deferred — stays server/CLI)
- Stem separation
- Loopable phrase detection
- Waveform timeline export
- Energy-curve playback integration
- Direct MUSIC library mutation from AudioLab

These are tracked in `audiolab/experiments/` for future phases.

---

## Folder Structure

```
audiolab/
├── README.md               — this file
├── requirements.txt        — Python dependencies
├── bin/
│   └── analyze_external.sh — main CLI entry point
├── tools/
│   ├── analyze_audio.py    — core analyzer (MUSIC export format)
│   ├── music_export.py     — CSV/JSON export utilities
│   └── camelot.py          — Camelot wheel reference tables
├── experiments/
│   └── sound/              — slice/playback experiments (not wired to MUSIC)
├── input/                  — drop audio here (not committed)
├── output/                 — analysis output (not committed)
│   ├── analysis-json/
│   ├── analysis-csv/
│   └── reports/
└── docs/
    └── AUDIO_ANALYSIS_FORMAT.md
```

---

## Guardrails

- Audio files are never committed.
- Large generated outputs are never committed.
- MUSIC library data is never stored or mutated from AudioLab.
- The JUG_PLAYER and pipeline experiments are preserved but not wired into playlist generation.
