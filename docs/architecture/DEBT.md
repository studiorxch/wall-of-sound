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
  deleted, not merged.
- **Revisit trigger**: if MUSIC's own preview surface is ever asked to
  reflect real RADIO Channel state, or if a user-visible inconsistency
  between the two is reported.

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

### Production `public/_headers` not confirmed honored by OpenAI Sites

- **Problem**: `studiorich-orbital`'s `public/_headers` (adding
  `Access-Control-Allow-Origin: */Access-Control-Allow-Methods: GET, HEAD`
  for `/radio/*`, and preserving vinext's pre-existing `/assets/*` immutable
  cache rule) was verified working locally via `wrangler dev`, but as of the
  last direct production check — after a reported OpenAI Sites deploy of the
  commit containing this file — **neither the new CORS rule nor the
  pre-existing cache rule was observed live** on `radio.studiorich.tv`.
- **Impact**: MUSIC's Event Radio Control "Load Package" bootstrap flow
  (`programFromManifest.ts` + `eventControlRuntime.ts`) cannot complete a
  real cross-origin fetch against the live package until this is resolved —
  it is currently blocked in production, though fully implemented and
  tested against synthetic data.
- **Current status**: open. Root cause not yet established — could be Sites
  deploy propagation delay, or a genuine gap in how OpenAI Sites' asset
  layer handles `_headers` relative to plain Cloudflare Workers Static
  Assets.
- **Revisit trigger**: the next time production is checked and either (a)
  the headers appear (issue was propagation delay — close this item), or
  (b) they still don't appear after a longer wait (escalate to whoever
  administers the OpenAI Sites project for that platform's own `_headers`
  support).
