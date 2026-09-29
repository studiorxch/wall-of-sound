# StudioRich Architectural Debt

Actionable items only — each has a problem, an impact, a current status, and
a concrete revisit trigger. This is not a general TODO list; see
[README.md](README.md) for what belongs here.

---

### This worktree's gitignored asset/reference mirrors are intentionally incomplete

- **Problem**: `library/catalog/audio/`, `library/external/audio/`,
  `library/reference/audio/`, every `library/**/*.{mp3,wav,flac,aiff,aif,
  m4a,ogg}`, and all of `WOS-share/` are gitignored (`.gitignore` root
  entries) — worktree-local, never shared by git between
  `wall-of-sound-beta01` and the older `wall-of-sound` checkout (see
  [DEPLOYMENT.md](DEPLOYMENT.md)'s "Worktree distinction"). Confirmed
  during RADIO-02 human acceptance (2026-09-29): this worktree's
  `library/music/catalog/audio/` has 5 files (~60KB) against the main
  checkout's 1044 files (~27GB) — same `catalog/tracks.csv` metadata,
  byte-identical (sha1 `d906221a...`), but almost none of the real audio
  it references. `WOS-share/SUNO_LIBRARY` doesn't exist in this worktree
  at all (only a small `WOS-share/MUSIC` subfolder does). By contrast,
  `library/music/RadioWebExports/**` (including its `.opus` audio) IS
  git-tracked — `.opus` isn't in the ignore list — so already-published
  local export bundles are real and correct here; this gap is specific to
  RAW, not-yet-exported catalog source audio and to the Suno manifest
  mirror.
- **Impact**: any MUSIC action needing raw catalog source audio for a
  track this worktree doesn't have a sample of — RADIO Publish's
  source-audio-hash check (`/radio-track-source-hash`,
  `music/vite.config.ts`), track preparation, Song Library's Suno-derived
  view — reports the track as genuinely unavailable/missing (correct
  behavior given the file really is absent locally), which looks
  identical to a real regression from the operator's point of view.
- **Current status**: not fixed, and not something code can fix — this is
  a data-provisioning gap, not a path-resolution bug. Both roots already
  have an established, documented override for exactly this situation:
  `PLAY_LIBRARY_ROOT` (`music/vite.config.ts`, resolves ALL of `LIBRARY_ROOT`
  — catalog reads AND `RadioWebExports`/`RadioTrackLibrary`/
  `TrackStemLibrary` write targets, since they're all one shared root) and
  `SUNO_LIBRARY_WOS_SHARE_ROOT` (same file, independent of the above,
  read-only). Pointing either at the main checkout's real copies
  (`/Users/studio/Projects/wall-of-sound/library/music`,
  `/Users/studio/Projects/wall-of-sound/WOS-share/SUNO_LIBRARY`) is safe —
  read-only for Suno manifests; for `PLAY_LIBRARY_ROOT`, a fresh Publish
  export would land under the main checkout's own `RadioWebExports`
  (additive/versioned, never overwrites), not this worktree's.
- **Revisit trigger**: before assuming any raw catalog track or Suno
  manifest is genuinely missing from the project — check whether it's
  simply absent from THIS worktree's local, gitignored copy first. Revisit
  if this worktree ever needs to test the full real catalog routinely
  without a cross-worktree `PLAY_LIBRARY_ROOT` override.

---

### `.claude/launch.json`'s "music" entry points at the wrong worktree

- **Problem**: this repo's own `.claude/launch.json` (tracked, committed) has
  exactly one `"music"` entry, and its `cwd` is
  `/Users/studio/Projects/wall-of-sound/music` — the OLDER/main worktree
  (see [DEPLOYMENT.md](DEPLOYMENT.md)'s "Worktree distinction") — not this
  `wall-of-sound-beta01` worktree's own `music/`. There is no separate
  `"music"` (or similarly named) entry for beta01 at all.
- **Impact**: any agent or tool that launches MUSIC via this named config
  (e.g. a `preview_start`-style launch by name) boots the OTHER worktree's
  code, silently — which can predate RADIO Channel/Program/operator-identity
  work that only exists on this branch (per DEPLOYMENT.md). Confirmed during
  a RADIO-02 human-acceptance investigation (2026-09-29): this was NOT the
  cause of that investigation's actual symptom (a plain `npm run dev` was
  used instead, bypassing this file entirely), but it's a real, separate,
  confirmed footgun for any future launch-by-name attempt.
- **Current status**: not fixed; not touched by this pass (out of scope —
  diagnosis only, per that investigation's own instructions).
- **Revisit trigger**: before relying on `preview_start`/launch-by-name for
  `"music"` from this worktree, or the next time someone adds a genuine
  beta01-specific `"music"` entry to this file.

---

### MUSIC's browser-persisted authoring state has no single documented canonical origin

- **Problem**: MUSIC persists all authoring state (library, playlists,
  RADIO playlists) exclusively in browser IndexedDB (`MUSIC_STATE_DB`,
  `music/src/logic/musicStateStore.ts`), which is scoped strictly by
  browser origin (scheme+host+port) AND by browser/profile — never by git
  worktree or filesystem path. Nothing in this repo documents one canonical
  origin (host:port) that real authored MUSIC state already lives under,
  and this repo's own tooling mixes at least two candidate origins for
  running MUSIC's dev server: plain `npm run dev` (`http://localhost:5173`
  by Vite's own default) and `tools/host-02/server.mjs`
  (`http://127.0.0.1:5220`, requires the Firebase emulators already
  running). These are two different origins with two independent, empty-
  until-proven-otherwise `MUSIC_STATE_DB` instances.
- **Impact**: opening MUSIC at the "wrong" origin/browser for a given
  authoring history looks identical to real data loss ("MUSIC State Could
  Not Be Loaded" / "No saved state was found") even though nothing was
  actually lost — confirmed during a RADIO-02 human-acceptance
  investigation (2026-09-29) where `http://localhost:5173` opened via
  MUSIC's own Vite dev server showed empty library/playlist counts.
- **Current status**: not fixed; this is a genuine environment/testing gap,
  not a RADIO-02 (or any other) code defect. No filesystem-based fallback
  or seed path exists anywhere in the load chain (confirmed: `App.tsx` →
  `playProjectStorage.ts` → `musicAutosave.ts` → `musicStateStore.ts`), so
  the only way to locate real prior state is to check IndexedDB directly
  (browser DevTools → Application → IndexedDB) at each candidate origin,
  in whichever browser/profile was actually used for that prior authoring.
- **Revisit trigger**: the next time a human acceptance pass reports
  unexpectedly empty MUSIC state, or before treating any one origin as
  "the" place real MUSIC authoring data lives.

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
  contract and files. **Partially human-accepted (2026-09-30)**: a real
  Chrome test reproduced the ORIGINAL failing sequence exactly —
  `MAP → Google popup sign-in → MAP authenticated → BLACKBOOK → MAP` — and
  the HOME runtime UUID (`c2a73228-1b4d-4f39-9616-343fdbb2d387`) survived
  unchanged throughout; MAP's own control correctly changed SIGN IN → MEMBER
  and ADMIN became visible for the authorized operator. This is real evidence
  the original defect is fixed for the hosted-MAP path. **Still unverified by
  a human**: a Google popup initiated from hosted BLACKBOOK while signed out;
  BLACKBOOK → MAP → BLACKBOOK after that BLACKBOOK-initiated sign-in;
  BLACKBOOK's own authenticated lifecycle (draw/PAGES/NEW/CLEAR-Undo/DELETE/
  reload-with-selected-Artwork); standalone MAP and standalone BLACKBOOK
  Google sign-in regression checks.
- **Revisit trigger**: before HOME-hosted BLACKBOOK sign-in specifically (not
  yet human-tested at all) is presented as safe for real use. A human Chrome
  pass through the remaining acceptance items above (§C in the HOST-03B
  human-acceptance report) is the one remaining gate — if it passes too,
  promote this from DEBT to a closed item; if BLACKBOOK-initiated sign-in
  still recreates HOME, the transport needs further investigation specific
  to that path.
- **Note (RADIO-01, 2026-10-01)**: RADIO-01 (persistent RADIO session
  ownership, see [home/README.md](home/README.md)'s own section) was
  implemented WITHOUT waiting for this item to close first — an explicit
  decision, since MEMBER/auth acceptance and RADIO ownership migration are
  separate concerns and this item's remaining gap is specific to
  BLACKBOOK-initiated hosted sign-in, not to navigation/session survival in
  general (already proven for the hosted-MAP path). RADIO-01's OWN human
  acceptance still needs real, seeded broadcast data to verify audible
  continuity — see that section's own "Not verified" note — which is a
  different, still-open requirement from this one.

---

### RESOLVED — RADIO-01 audible playback continuity

Human audible acceptance PASSED (2026-10-02). Local emulator seeded with a
real Program/Channel referencing the already-existing local
`soft-motion-radio` v1 package (served via the existing dev-only
`/radio-web-export/` route — no new RADIO architecture, no production
access). Persistent runtime `a6d46deb-3a51-4966-9c16-0d304690a745`. Human
confirmed RADIO remained audibly continuous across MAP → BLACKBOOK and
BLACKBOOK → MAP — no interruption, restart, perceptible seek/resync, or
duplicate/echo playback; the persistent runtime UUID stayed unchanged;
explicit RADIO OFF stopped playback. See
[home/README.md](home/README.md)'s own RADIO-01 section for the full
record. No longer an open item.
