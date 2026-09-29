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

---

### HOME HOST-01 development-only integration seams

- **Problem**: HOME hosts controlled fixtures through dev-only query URLs; artwork
  replacement remounts the fixture. Lifecycle leave currently only hides the slot
  and cancels readiness timing, with no real surface save/drain protocol.
- **Impact**: proves parent ownership but cannot yet host real MAP/BLACKBOOK or
  provide production canonical URLs or persistent RADIO.
- **Current status**: HOST-02 (real MAP) and HOST-03 (real BLACKBOOK) are both
  done — both of HOME's two surfaces are now real documents; the HOST-01 fixture
  files remain present but are unreachable from ordinary navigation. See
  [home/README.md](home/README.md).
- **Revisit trigger**: canonical production routing and RADIO ownership still
  require their own later checkpoints. See the dedicated HOST-03 auth-popup
  entry below for the one open, disclosed defect from HOST-03's own human
  acceptance pass.

---

### HOME HOST-03 — real Google sign-in popup recreates the HOME runtime

- **Problem**: human Chrome acceptance of HOST-03 found that after a real
  `signInWithGoogle()` popup sign-in succeeds inside HOME-hosted BLACKBOOK,
  the NEXT navigation (BLACKBOOK → MAP via BLACKBOOK's own MAP control)
  recreates HOME's own top-level document (`home-dev.html`) — a brand-new
  runtime UUID appears, proving the persistent HOME runtime itself was
  reloaded, not merely the child surface. Confirmed NOT caused by this
  batch's own navigation code (`syncArtworkRoute`/`openArtwork`/
  `setActiveArtworkIdentity`/the `#map-nav-link` interception): signing in
  via `createUserWithEmailAndPassword` against the same emulator, then
  following the identical MAP → BLACKBOOK → sign-in → BLACKBOOK → MAP steps,
  did NOT reproduce it — isolating the cause to the real Google popup flow
  itself (or its interaction with BLACKBOOK now always running inside an
  iframe, which it never did before HOST-03), most likely a Chrome
  Cross-Origin-Opener-Policy process-isolation side effect of opening a
  cross-origin popup from a nested browsing context, or a Google-OAuth
  anti-clickjacking restriction on iframe-invoked sign-in prompts — not
  proven to one exact mechanism, only isolated and reproduced.
- **Impact**: HOME-hosted BLACKBOOK sign-in via the real Google popup is
  unsafe for real product use — the loss of the HOME runtime defeats the
  entire point of a persistent host (in-memory RADIO/session state, if any
  existed at that point, would be destroyed). This was an explicitly named,
  pre-existing risk: `proposals/HOME_PERSISTENT_HOST_V1.md`'s own "Final
  acceptance and unresolved questions" section flagged "auth
  popup/persistence in hosted mode" as unresolved before HOST-03 began.
- **Current status**: HOST-03B implemented HOST-03A's recommended narrow
  authentication transport/coordination adapter — HOME's own (never-nested)
  window initiates/completes the Google popup on a hosted surface's behalf,
  relaying back only an opaque credential for that surface's own unmodified
  `MemberIdentityAuthority` to consume via `signInWithCredential`. See
  [home/README.md](home/README.md)'s "HOST-03B" section for the implemented
  contract and files. **NOT yet proven against a real Google popup in a real
  browser** — this agent's own sandboxed browser-automation tool cannot open
  a genuine popup window at all (confirmed AGAIN this pass to be a general
  tool limitation, not specific to a nested-iframe caller: triggering the
  popup from HOME's own never-nested window produced the identical
  `window.opener === null`/same-tab-navigation anomaly). Ordinary hosted
  MAP↔BLACKBOOK navigation with no auth involved was re-confirmed unaffected
  by this batch's changes (one HOME runtime UUID held across a full round
  trip).
- **Revisit trigger**: before HOME-hosted BLACKBOOK or MAP sign-in is
  presented as safe for real use, or before RADIO-01 begins (RADIO-01 depends
  on HOME's top-level document surviving ordinary member interactions). A
  real human Chrome pass through the required acceptance sequence (see the
  HOST-03B completion report) is the one remaining gate — if it passes,
  promote this from DEBT to a closed item and mark RADIO-01 eligible on this
  axis; if it still recreates HOME, the transport itself needs further
  investigation (this was NOT achievable via this agent's own tooling this
  pass).
