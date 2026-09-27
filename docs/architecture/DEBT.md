# StudioRich Architectural Debt

Actionable items only — each has a problem, an impact, a current status, and
a concrete revisit trigger. This is not a general TODO list; see
[README.md](README.md) for what belongs here.

---

### RADIO manifest/clock index identity mismatch

- **Problem**: `resolvedBroadcastState.ts`'s callers index the original
  manifest entries array by a position computed from a *filtered* array,
  not the original one — the index spaces don't actually match.
- **Impact**: any code path reusing this indexing pattern risks resolving
  the wrong track. New Channel-Clock/Program-Clock code
  (`channelTrackPosition.ts`) deliberately sidestepped this by writing
  fresh, never-filtered array-indexing logic rather than reusing or
  repairing the old path.
- **Current status**: not fixed. Isolated — the new Channel resolution path
  does not depend on it and is not affected by it.
- **Revisit trigger**: if a future change needs to reuse
  `resolveProgramPosition`/`resolvedBroadcastState.ts`'s own indexing (rather
  than writing a fresh resolver again), or if a real playback bug is traced
  back to this mismatch.

---

### MUSIC RADIO publish bundle preload cost

- **Problem**: `RadioPlaylistPublishPanel.tsx`'s Firebase dependency (needed
  for "Create Program") was originally constructed eagerly at module scope,
  adding real bundle weight and unconditional Firebase App/Auth
  construction to every MUSIC session regardless of whether RADIO publish
  was ever opened. This was fixed with lazy construction (module-level
  cache + getter, built only on first real use) — the dependency itself
  (and its bundle cost when RADIO publish *is* used) remains.
- **Impact**: acceptable today; would become worse if more Firebase-backed
  features accrete into files that are part of MUSIC's main, always-loaded
  bundle.
- **Current status**: lazy-construction mitigation in place; the underlying
  dependency is unchanged.
- **Revisit trigger**: if MUSIC's main bundle size becomes a real problem,
  or if another eagerly-imported file adds a similar Firebase dependency
  without the same lazy-construction discipline.

---

### Legacy MUSIC "now playing"/broadcast HUD remains separate from RADIO Channel authority

- **Problem**: `nowPlayingBroadcastBridge.ts`, `BroadcastSecondaryLayer.tsx`,
  and `BroadcastHudShell.tsx` implement MUSIC's own local "what's playing"
  broadcast concept, wired into `App.tsx`. This is architecturally distinct
  from — and does not consume — RADIO's canonical Channel Clock
  (`resolveChannelRotation`/`resolveCurrentChannelBroadcast`).
- **Impact**: two different things can plausibly claim to represent "what's
  currently playing" depending on which surface you're looking at. Not
  currently causing an observed bug, but a natural source of future
  confusion (see OWNERSHIP.md's "Known noncanonical / replaced mechanisms").
- **Current status**: both paths run today, independently, for different
  purposes (MUSIC's own in-app preview vs. RADIO's real broadcast). Not
  deleted, not merged. Confirmed during SUBWAY architecture consolidation
  (2026-09) that `wall/systems/presentation/nowPlayingHud.js` — LIVE MAP's
  own "Now Playing" HUD — reads this same legacy `nowPlayingBroadcastBridge.ts`
  snapshot (via `localStorage` key `wos:nowPlaying:snapshot`), not RADIO's
  Channel Clock. MAP also has a separate, active Channel receiver/HUD:
  `radioChannelReceiverRuntime.ts` + `radioChannelHud.js`. The legacy HUD
  is not its only consumer and does not describe RADIO playback. MAP and
  BLACKBOOK still own independent document-level receivers; cross-surface
  playback continuity is not implemented.
- **Revisit trigger**: if MUSIC's own preview surface is ever asked to
  reflect real RADIO Channel state, or if a user-visible inconsistency
  between the two is reported.

---

### SUBWAY station-geometry authoring system has no bridge into the live `wall/` runtime

- **Problem**: the MUSIC-side station-geometry/archetype/editor system
  (`music/src/data/stationGeometryTypes.ts`, `stationGeometryStore.ts`,
  `music/src/logic/maps/station*`, `music/src/ui/maps/StationGeometryEditor.tsx`)
  persists to its own IndexedDB (`MUSIC_STATION_GEOMETRY_DB`) and has **zero**
  consumers anywhere in `wall/` — confirmed by grep, no file under `wall/`
  references `stationGeometry`/`StationGeometryData`. The editor is also not
  wired into MAPS' own "Stations" library navigation
  (`MapsStationDetail.tsx`/`MapsStationsGrid.tsx`, which bridges a different,
  unrelated station identity via `wallStationLibraryBridge.ts` — see
  [subway/README.md](subway/README.md) §8).
- **Impact**: authored station geometry (platform footprints, track
  centerlines, level/mezzanine structure) cannot render on the live SUBWAY
  map today, no matter how calibrated it is. Any future agent asked to "show
  the authored station geometry on the map" must build this bridge — it does
  not already exist and should not be assumed to.
- **Current status**: not built. Editor and data model are real and
  functional in isolation; only 4 stations have any record at all, and only
  Bay Ridge Av is confirmed platform-plan-calibrated (see
  [subway/README.md](subway/README.md) §6/§7).
- **Revisit trigger**: the first batch that needs authored station geometry
  to actually render in `wall/` (Surface Map, Underground/3D, or a future
  station-interior view).

---

### `SubwayTrackStructureAuthority` has zero rendering/camera/visibility consumers

- **Problem**: `wall/systems/transit/subwayTrackStructureAuthority.js`
  classifies real track segments (underground/elevated/at_grade/open_cut/
  embankment/unknown) from an official, pre-joined NYC Subway Lines ROW_TYPE
  snapshot — but, per its own header's explicit scope boundary, no
  rendering, camera, altitude, or visibility system currently calls into it.
- **Impact**: there is real, already-sourced ground-truth data for deciding
  when a train visually enters a tunnel or elevated structure, but nothing
  uses it yet. A future agent implementing Surface/Underground visual
  transitions could easily not know this data already exists and build a
  second, redundant classifier.
- **Current status**: data and classification API exist and are tested;
  unconsumed.
- **Revisit trigger**: the first batch that needs to decide, at render time,
  whether a given train/track segment is underground/elevated/at-grade —
  route it through this authority rather than re-deriving the classification.

---

### `DEFAULT_EVENT_PROGRAM_CONFIG.manifestBaseUrl` still hardcodes a dev-only path

- **Problem**: `music/src/member/eventProgramConfig.ts`'s
  `DEFAULT_EVENT_PROGRAM_CONFIG.manifestBaseUrl` defaults to
  `"/radio-web-export/soft-motion-radio/v1/"` — the same class of
  dev-server-only relative path that `RadioPlaylistPublishPanel.tsx`'s
  Program-creation flow used to have (fixed to use
  `buildRadioPublicPackageBaseUrl`). This sibling default was never
  updated.
- **Impact**: this default is only used as a fallback for the unrelated
  `eventProgram/current` config system, not `radioPrograms` — lower
  severity than the Program-creation bug was, but the same class of latent
  production-unsafe default.
- **Current status**: not fixed.
- **Revisit trigger**: before this default is ever relied on outside a
  local MUSIC dev server, or as part of any future batch touching
  `eventProgramConfig.ts`.

---

### RESOLVED — production RADIO CORS

`studiorich-orbital`'s `public/_headers` approach was never honored by
OpenAI Sites' hosting; the real fix (`worker/index.ts`, commit `60b415f`)
was validated first at a temporary Cloudflare `*.workers.dev` URL, then put
into production via a Cloudflare Worker route on `radio.studiorich.tv/*`
(`studiorich.tv`'s authoritative DNS is now Cloudflare; OpenAI Sites remains
the origin behind that route, not removed). Verified directly against
`radio.studiorich.tv` itself: manifest and a real `.opus` asset both return
`Access-Control-Allow-Origin: */Access-Control-Allow-Methods: GET, HEAD`
with an `Origin` header, and both are byte-identical (sha256-verified) to
the known immutable package. See DEPLOYMENT.md for the full mechanism and
verification evidence. No longer an open item.
