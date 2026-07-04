# PLAY Patch 0621E — Playlist Source Group Isolation
**Completion Report · 2026-06-21 · Product Trust (P0/P1)**

---

## Summary

Automatic playlist construction (Fill Missing Time, Regenerate From Curve, Fill Gap) now only pulls tracks from the active playlist's own source group. A single source-eligibility helper governs all auto-pull paths. Manual drag/add is unaffected. Existing projects migrate non-destructively.

---

## Product Rule (locked in)

```
A playlist only auto-fills / regenerates from its own source group,
unless the user explicitly enables allowCrossGroupAutofill.
Manual placement is always allowed and never consults eligibility.
```

---

## Files Changed

### NEW: `src/logic/sourceEligibility.ts`
- `isTrackEligibleForPlaylist({track, playlist})` — the single eligibility rule.
- `filterTracksForPlaylist({tracks, playlist})` — convenience filter.
- `sourceGroupIdFor(playlistId)` → `source-${playlistId}` (deterministic).

**Eligibility rule (backward-compatible):**
```
allowCrossGroupAutofill === true   → eligible (opt-out of isolation)
track.sourceGroupId == null        → eligible (legacy/unscoped, preserves pre-0621E workflow)
otherwise                          → track.sourceGroupId === playlist.sourceGroupId
```

### `src/data/trackTypes.ts`
- Added `sourceGroupId?: string` to `Track` (undefined = unscoped/globally eligible).

### `src/data/playProjectTypes.ts`
- Added `sourceGroupId?: string` and `allowCrossGroupAutofill?: boolean` to `PlaylistRecord`.

### `src/data/playProjectStorage.ts` (migration — builds on 0621C loader)
- `migrateV1` assigns `sourceGroupId` to the migrated playlist.
- `repairStoredProject` (runs inside the 0621C-stabilized `loadPlayProject`):
  - Backfills each playlist's `sourceGroupId` = `source-${playlistId}` if missing.
  - Scopes each unscoped library track that lives in **exactly one** playlist to that playlist's group. Tracks in zero or multiple playlists stay unscoped (non-destructive — never breaks multi-playlist membership).
  - Logs `console.info` with the scoped count.

### `src/App.tsx`
- `makeDefaultPlaylist` assigns a unique `sourceGroupId` + `allowCrossGroupAutofill: false`. (New playlists via `handleCreatePlaylist` inherit this; duplicates intentionally keep the source group — a variant draws from the same pool.)
- `handleTracksImported` tags imported tracks with the **active playlist's** `sourceGroupId` (only if the track is not already scoped).
- Applied source filtering at every automatic pull path:
  - `regenerateForPL`, `handleCurveChange`, `handleRegenerateFromCurve` → `assignPlaylistToCurve({ tracks: filterTracksForPlaylist(...) })`.
  - `handleFillGap` → inline `isTrackEligibleForPlaylist` predicate in the candidate filter.
  - `handleFillMissingTime` → passes `eligibleTrackIds` set.

### `src/logic/fillMissingTime.ts`
- Added optional `eligibleTrackIds?: Set<string>` param. The full `libraryTracks` still resolves already-placed slot tracks (duration/dedup stay correct, manual placements survive); only **new candidates** are restricted to the eligible set.

---

## Migration Behavior

| Stored state | After load |
|--------------|------------|
| Playlist missing `sourceGroupId` | Assigned `source-${playlistId}` |
| Track in exactly 1 playlist, unscoped | Scoped to that playlist's group |
| Track in 0 playlists (pure library) | Left unscoped (globally eligible) |
| Track in 2+ playlists | Left unscoped (non-destructive) |
| Already-scoped track | Untouched |

Migration mutates a copy and never discards a valid saved project (preserves 0621C guarantees).

---

## Source Eligibility Behavior

- Default `allowCrossGroupAutofill` is false/undefined.
- Legacy library imported before 0621E (unscoped) remains shared across playlists — **zero regression** to the existing single-library workflow.
- New imports while a playlist is active are scoped to that playlist → genuine isolation going forward.

---

## Verification (browser, port 5173)

Seeded a legacy project (no source groups): Playlist A holds track `tA`, Playlist B holds `tB`, `tShared` is library-only. After reload:

```
persistedPlaylistGroups: { pl_A: "source-pl_A", pl_B: "source-pl_B" }   ✅ migrated + persisted
tA_group: "source-pl_A"   tB_group: "source-pl_B"   tShared_group: null  ✅ single-membership scoped
ISOLATION_tB_eligibleForA: false   ISOLATION_tA_eligibleForB: false      ✅ no cross-pull
SHARED_tShared_eligibleForA: true  SHARED_tShared_eligibleForB: true     ✅ legacy stays shared
```

- ✅ Migration log fired: "Source-group migration scoped 2 track(s) to their playlist."
- ✅ Editor renders correctly (Playlist A active, track row + badges, library = 3).
- ✅ Broadcast HUD unchanged — single top row, atmosphere surface, "Not playing / Playlist A" (0621D intact).
- ✅ Reload preserves playlists, active playlist, tracks, and `sourceGroupId` values (0621C intact).
- ✅ `npx tsc --noEmit` clean.

**Acceptance criteria 1–12: all met.**

---

## Known Risks

- **Existing already-organized projects:** a track that lived in exactly one playlist is now scoped to it and will no longer be auto-pulled into other playlists. This is the intended product correction, but it is a behavior change for pre-0621E multi-playlist projects. Tracks in multiple playlists, and the untouched shared library, stay globally eligible.
- **Regenerate drops cross-group manual placements:** Regenerate From Curve rebuilds from the active source group, so a track manually dragged in from another group can be dropped on an explicit regenerate. This is consistent with "regenerate uses the active source group" (criterion 6); manual placements persist across reload and survive Fill Missing Time (which preserves placed slots).
- **Pre-existing fragility (not introduced here):** `MainTrackWindow.warnBadges(slot.warningMessages)` throws if a slot lacks `warningMessages`. Real app-generated slots always include it; only hand-malformed data triggers it. The storage loader does not backfill it. Candidate for a one-line defensive fix in a future cleanup.

---

## Next Recommended Patch

`0621F` — minimal source-boundary UI affordance: a compact "Source: This Playlist" label/tooltip near the active playlist and an explicit "Import to Active Playlist" vs "Import to Library" choice, plus an `allowCrossGroupAutofill` toggle in Playlist Settings. (Spec point 6 was kept intentionally minimal in 0621E; this surfaces it.)

---

## Patch Status: ✅ COMPLETE
