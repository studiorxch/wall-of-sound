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
  Channel Clock. MAP does not implement RADIO playback; this is its one
  "now playing" consumer, and it is the legacy path.
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

### OpenAI Sites production deploy not confirmed for the RADIO CORS fix

- **Problem**: `studiorich-orbital`'s `public/_headers` approach was
  confirmed, across multiple days of direct production checks, to never be
  honored in production (identical stale `ETag`, no `access-control-*`
  header, pre-existing `/assets/*` cache rule also unhonored) — ruled out as
  propagation delay given the elapsed time. The fix was moved to
  `worker/index.ts` itself (commit `60b415f`, pushed to `origin/main`),
  which intercepts `/radio/**` and adds CORS headers in code confirmed to
  execute per-request in production (the existing `/_vinext/image` path
  proves the Worker's own `fetch` handler runs there). As of the last
  direct check, **production is still serving the pre-fix build** —
  identical `ETag` to before this push — confirming (again) that `git push`
  alone does not trigger an OpenAI Sites deploy.
- **Impact**: MUSIC's Event Radio Control "Load Package" bootstrap flow
  (`programFromManifest.ts` + `eventControlRuntime.ts`), the Channel
  listener, and BLACKBOOK/Event Music all remain blocked from real
  cross-origin package access in production until this deploy actually
  lands — all fully implemented and tested against synthetic/local data.
- **Current status**: open. An explicit OpenAI Sites rebuild/deploy of
  `studiorich-orbital` was reported completed after `60b415f`. Re-verified
  directly afterward (manifest GET+HEAD, one `.opus` GET, all with an
  `Origin` header, plus cache-busting query strings to rule out a stale
  Cloudflare cache entry): production **still returns the pre-fix
  response** — identical `ETag`, no `access-control-*` header.
  `origin/main` was independently confirmed to be exactly `60b415f`
  (`git fetch` + `git log origin/main -1`), ruling out "wrong commit
  pushed" as the cause. The remaining possibilities are narrowed to: the
  reported Sites deploy did not actually complete/target this commit, or
  Cloudflare's edge is caching the pre-deploy response independently of the
  new deploy (less likely given cache-busting query strings didn't help
  either). Root cause still not established from this environment.
- **Revisit trigger**: after the next confirmed OpenAI Sites deploy,
  re-check production directly (manifest + `.opus` GET with an `Origin`
  header) before assuming this is resolved.
