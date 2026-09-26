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

### OpenAI Sites does not reliably deploy `studiorich-orbital` — direct Cloudflare deployment proven as the alternative

- **Problem**: `studiorich-orbital`'s `public/_headers` approach was
  confirmed, across multiple days of direct production checks, to never be
  honored in production. The fix was moved to `worker/index.ts` itself
  (commit `60b415f`), which intercepts `/radio/**` and adds CORS headers in
  code confirmed to execute per-request (the existing `/_vinext/image` path
  proves the Worker's own `fetch` handler runs there). Even after a
  reported explicit OpenAI Sites rebuild/deploy of `60b415f`, production
  continued to return the identical pre-fix `ETag` with no `access-control-*`
  header — confirmed via cache-busted requests and independent verification
  that `origin/main` was exactly `60b415f` (ruling out a push/branch
  mismatch). **This isolated the problem to OpenAI Sites' own deploy
  reliability, not the code.**

  Proof: the exact same commit (`60b415f`), built with the exact same
  `npm run build`, deployed directly to Cloudflare Workers via
  `npx wrangler deploy --config dist/server/wrangler.json`, worked
  correctly on the **first attempt** — manifest GET/HEAD and a real
  `.opus` GET all returned `Access-Control-Allow-Origin: *` /
  `Access-Control-Allow-Methods: GET, HEAD` with an `Origin` header, at
  `https://studiorich-orbital.richardjlau.workers.dev`, with byte-identical
  (sha256-verified) package content.
- **Impact**: MUSIC's Event Radio Control "Load Package" bootstrap flow,
  the Channel listener, and BLACKBOOK/Event Music all remain blocked from
  real cross-origin package access **in current production**
  (`radio.studiorich.tv`, still served by OpenAI Sites) until the
  custom-domain cutover to direct Cloudflare deployment happens. They would
  work today against the proven `*.workers.dev` temporary URL.
- **Current status**: root cause resolved (OpenAI Sites deploy
  unreliability, not a code defect). Direct Cloudflare Workers deployment
  is proven and repeatable — see DEPLOYMENT.md's "Proven alternative path."
  `radio.studiorich.tv` itself has **not** been cut over yet — that is a
  separate, explicitly-gated custom-domain change, not yet approved/done.
- **Revisit trigger**: this item closes once `radio.studiorich.tv` is cut
  over to the direct Cloudflare deployment and verified; until then, any
  RADIO batch depending on production CORS should use the `*.workers.dev`
  URL for verification, not assume `radio.studiorich.tv` reflects the
  latest source.
