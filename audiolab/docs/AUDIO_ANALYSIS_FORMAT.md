# AudioLab Analysis Format

## JSON Schema

Each analyzed track produces one JSON object:

```json
{
  "trackId": "external:white-ropes",
  "filePath": "/Music/External/Soulphiction - White Ropes.flac",
  "filename": "Soulphiction - White Ropes.flac",
  "title": "White Ropes",
  "artist": "Soulphiction",
  "durationSeconds": 421.4,
  "durationDisplay": "7:01",
  "bpm": 124.6,
  "key": "C#",
  "camelotKey": "3A",
  "camelotConfidence": "estimated",
  "energy": 0.62,
  "energySource": "analyzed_estimate",
  "sampleRate": 44100,
  "channels": 2,
  "beatsDetected": 847,
  "analysisSource": "librosa",
  "analysisVersion": "audiolab-0.1.0",
  "analyzedAt": "2026-07-05T00:00:00Z",
  "metadataSource": "analyzed",
  "error": null
}
```

## Field Notes

| Field | Source | Notes |
|---|---|---|
| `trackId` | derived | `external:` + slugified stem |
| `filePath` | filesystem | absolute, resolved path |
| `durationSeconds` | soundfile → librosa | soundfile preferred |
| `bpm` | librosa beat tracker | rounded to 1 decimal |
| `key` | chroma mean argmax | 12-note chromatic scale |
| `camelotKey` | major/minor mode detect | null if mode ambiguous |
| `camelotConfidence` | `estimated` / `low` | low = mode was ambiguous |
| `energy` | RMS + onset + centroid + tempo | normalized 0.0–1.0 |
| `energySource` | constant | `analyzed_estimate` |

## CSV Columns

```
trackId,filePath,filename,title,artist,durationSeconds,bpm,key,camelotKey,energy,sampleRate,channels,beatsDetected,analysisSource,analyzedAt
```

## MUSIC Import Matching Priority

When importing a CSV through MUSIC Metadata Completion:

1. `trackId` — exact match
2. `filePath` — exact match
3. `title` + `artist` — normalized (lowercase, alphanumeric only)
4. `filename` — (planned; not yet in MUSIC importer)

## Supported Audio Formats

`.wav` · `.flac` · `.mp3` · `.aiff` · `.aif` · `.m4a` · `.ogg`

## Known Limitations (audiolab-0.1.0)

- **Camelot key**: Mode detection is a heuristic (template correlation). Minor/major distinction can be wrong for complex arrangements. Set `camelotConfidence: low` when mode is ambiguous.
- **Energy**: Composite estimate — not a DJ-standard loudness measure. Useful for relative scoring within a crate; not directly comparable to Rekordbox/Serato energy values.
- **BPM**: librosa beat tracker works well for 4/4 material. May halve/double for very slow or irregular material.
- **Title/Artist parsing**: Best-effort from filename. Expects `Artist - Title` or `NN. Artist - Title` format.
