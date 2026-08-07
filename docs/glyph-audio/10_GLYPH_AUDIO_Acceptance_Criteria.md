# Glyph Audio — Acceptance Criteria

## 1. Repository safety

- No unrelated MAPS, itinerary, orb, overlay, vehicle, or stem files are modified.
- No broad `git add .`.
- No `git reset`.
- No `git clean`.
- No automatic commit.
- No changes to `apps/glyphlab-reference/` unless explicitly approved.
- All implementation changes remain inside the approved MUSIC/Glyph allowlist.

## 2. Determinism

Given the same:

- source audio;
- analysis document;
- grammar version;
- mapping preset;
- layout preset;
- seed;
- renderer version;

the system produces geometrically equivalent SVG paths.

Changing only the seed may alter handmade deformation without changing beat order or structural punctuation.

## 3. Musical traceability

- Every confirmed beat produces one traceable glyph instance.
- Every glyph instance stores its source beat ID.
- Bar boundaries are visible through the active boundary mapping.
- Section boundaries are visible where section data exists.
- Silence produces negative space or an explicit rest behavior.
- Low-confidence measurements retain their confidence and use documented fallback behavior.

## 4. Mapping flexibility

- Energy is not hardcoded permanently to height.
- At least four musical properties can be reassigned to supported visual targets.
- Mapping presets can be saved and reloaded.
- Mapping changes do not alter the musical analysis.
- The same analysis can be rendered using more than one mapping preset.

## 5. Visual grammar

- The MVP uses one coherent arch-based gesture family.
- The grammar supports 1–6 arches.
- Height variation is visibly legible.
- Width variation is visibly legible.
- Sharpness variation visibly moves between rounded and angular behavior.
- Dots read as punctuation rather than decoration.
- The output remains monoline.
- The output reads closer to writing, notation, inscription, or manuscript than to an equalizer or waveform.

## 6. Handmade quality

- Handmade variance is deterministic.
- Variance is bounded.
- Variance does not reorder beats.
- Variance does not push paths outside page bounds.
- Variance does not cause uncontrolled self-intersection.
- Setting variance to zero produces a clean canonical form.
- Increasing variance produces recognizable hand presence without fake scratches.

## 7. Beat-grid review

- Audio can play and pause.
- Beat markers are visible.
- A beat can be added.
- A beat can be moved.
- A beat can be removed.
- A corrected grid regenerates the manuscript.
- The user can see when the grid has not been confirmed.

## 8. Layout

- Time progresses left to right.
- Rows progress top to bottom.
- Wrapping occurs at musical boundaries, not character counts.
- Bars per row is configurable.
- Section boundaries can start a new row.
- A4, square, and custom physical page dimensions are supported.
- Margins are respected.

## 9. SVG export

- SVG is produced from canonical data, not scraped from the DOM.
- `width` and `height` use physical units.
- `viewBox` matches the page model.
- All plotted marks use vector paths or approved primitive circles for dots.
- `fill="none"` is used for line paths.
- No text fallback is present.
- No filters or raster images are present.
- Stroke color and width are configurable.
- Export metadata includes project, source, grammar, mapping, layout, seed, and renderer versions.
- The exported centerlines match the preview centerlines.

## 10. Project persistence

- Saved Glyph Compositions persist through MUSIC's existing `PlayProject` storage.
- Project JSON export/import may follow after the first slice, but when implemented must validate schema versions and return clear errors.
- No missing-glyph fallback substitutes literal characters.
- Reloading a project restores the same visible composition.

## 11. Performance

Initial target for a typical five-to-eight-minute track:

- interaction remains responsive;
- mapping adjustments update without re-decoding audio;
- the app does not rerun full analysis when only visual parameters change;
- SVG generation completes without freezing the UI;
- a path-count warning appears before excessive plot complexity.

No hard millisecond target is required until the first prototype is profiled.

## 12. Visual review gate

A build does not pass solely because the analysis and SVG are technically valid.

At least one generated page must be reviewed against:

- the two music-derived handwritten references;
- the handmade quality requirement;
- the language-over-decoration principle;
- punctuation behavior;
- intricacy;
- avoidance of generic visualization.

## 13. MVP completion

The MVP is complete when:

1. one audio file can be imported;
2. its beat grid can be reviewed;
3. beats become arch-family glyphs;
4. mappings can be adjusted and saved;
5. the result renders as manuscript rows;
6. the same project regenerates deterministically;
7. project JSON round-trips;
8. AxiDraw-oriented SVG exports;
9. no unrelated repository work is touched.
