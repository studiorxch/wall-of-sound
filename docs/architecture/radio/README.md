# RADIO Architecture Map

Read this before any RADIO-related task. See [../README.md](../README.md)
for what this directory is. This page describes what's true now, not how it
got that way.

## The pipeline

```
MUSIC
  ↓ Send to RADIO
RadioPlaylist
  ↓ Publish
immutable RadioWebManifest Package
  ↓ referenced by
Program
  ↓ scheduled by
Channel
  ↓ deterministic wall-clock resolution
Broadcast State
  ↓ consumed by
RADIO / MAP / BLACKBOOK / future surfaces
```

**`RadioPlaylist ≠ Package ≠ Program ≠ Channel`** — four distinct things,
never collapsed into each other.

## Identity

```
RadioPlaylist.id                 authoring identity        (music/src/data/radioPlaylistTypes.ts)
{stationId, bundleVersion}       immutable package identity (music/src/data/radioWebBundleTypes.ts)
programId                        operational Program identity (generateRadioProgramId(), independent of package identity)
channelId                        broadcast Channel identity  (fixed "studiorich-radio" for the first Channel)
slug + version                   public routing identity ONLY — never used as Program/Channel identity
```

## Authority

```
Firestore radioPrograms          Program catalog
Firestore radioChannels          Channel authority (status + rotation: anchorAtMs + programIds)
Firestore eventProgram/current   single active event config (personal/clock playback mode)
immutable public manifest        package/content authority (radio-manifest.json — trackCount, totalDurationSeconds, etc., all read verbatim, never recomputed by a consumer)
sessionStorage                   Personal resume ONLY (radioResumableSession.ts) — never broadcast authority
MUSIC IndexedDB                  MUSIC authoring ONLY — never a source of truth for anything published
```

## Canonical runtime path

```
resolveChannelRotation                    "Channel Clock" — which Program owns airtime right now
  (music/src/logic/radio/channelRotation.ts)

hydrateChannelRotationFromCatalog         joins persisted programIds[] against the live radioPrograms catalog
  (music/src/logic/radio/channelRotationHydration.ts)

resolveCurrentChannelBroadcast            composes Channel lookup → hydration → rotation resolution
  (music/src/logic/radio/currentChannelBroadcast.ts)

resolveTrackAtProgramOffset               "Program Clock" — which track owns the resolved offset
  (music/src/logic/radio/channelTrackPosition.ts)
  — deliberately NOT the same resolver as resolvedBroadcastState.ts's
    resolveProgramPosition, which models a different, independently
    operator-configured timeline. Never merge these two.

resolveChannelTrackBroadcast              composes the Channel clock + Program clock + manifest fetch
  (music/src/logic/radio/channelTrackBroadcast.ts)

channelListenerPlayback.ts                drives real audio via DualDeckPlaybackEngine
  (music/src/audio/DualDeckPlaybackEngine.ts)
```

Every resolver above is a **pure function of `(state, nowMs)`** — no stored
cursor, no `setInterval`-driven position advancement. A `setInterval` may
exist purely to *refresh a display* (explicitly disclaimed as not being
broadcast authority when it does) — it never advances playback state itself.

A resolution or fetch failure is returned/reported verbatim — **authority,
not availability**. A missing/malformed/duplicate Program reference
invalidates the whole rotation resolution (all-or-nothing), never a silent
partial result or a fallback to a different track.

## What is NOT Channel authority

- **`active.json`** (in `studiorich-orbital`'s `public/radio/`) selects what
  the *existing, separate, package-slug-based* public RADIO player
  (`radio-player.html`/`radioPlayerMain.ts`, and the equivalent page in
  `studiorich-orbital`) considers active. It has no relationship to
  `radioChannels` and is never read by any Channel resolver.
- **MUSIC's own Schedule** (`music/src/logic/scheduleResolver.ts`,
  `scheduleTypes.ts`, `SchedulerGuideView.tsx`) is a MUSIC/Smart-Grid-
  specific concept (no recurrence model, naive timezone display,
  MUSIC-specific vocabulary) — it is not reusable as RADIO Channel
  scheduling and is not the same system.
- **MUSIC's own "now playing"/broadcast HUD**
  (`nowPlayingBroadcastBridge.ts`, `BroadcastSecondaryLayer.tsx`,
  `BroadcastHudShell.tsx`) is a separate, MUSIC-local concept — see
  [../DEBT.md](../DEBT.md). It does not consume or reflect the Channel
  Clock.

## Public package addressing

```
https://radio.studiorich.tv/radio/<slug>/v<n>/
```

This is the one canonical public package base URL, produced by
`buildRadioPublicPackageBaseUrl` (`music/src/logic/radio/radioWebBundlePlan.ts`)
and matching `studiorich-orbital`'s own `publish-radio-to-sites.mjs`
destination convention exactly. `manifestBaseUrl` on a `radioPrograms`
document should always be this — never MUSIC's own `/radio-web-export/...`
dev-server preview route, which exists only for local preview and is never
reachable from production.

## MAP's relationship to RADIO

MAP is now a real receiver of RADIO's canonical Channel — not a description
of future direction, an actual wired integration:

```
music/src/member/radioChannelReceiverRuntime.ts   (real Vite/TS module, its
  own build entry -> assets/radio-channel-receiver-runtime.js -- the ONE
  shared bootstrap script both wall/index.html AND blackbook.html load)
  publishes window.SBE.RadioChannelReceiver (control: turnOn/turnOff/
  setVolume) and window.SBE.RadioChannelReceiverState (read-only), same
  bridge convention subwayMemberRuntime.ts already uses for
  MemberIdentityState.
        ↓
wall/systems/presentation/radioChannelHud.js   (plain JS, wall/'s own
  runtime) -- reads/controls ONLY through that bridge. Computes nothing
  about Channel/Program/track resolution itself.
```

### Persistent ownership under the StudioRich shell (RADIO-01)

**Terminology**: "the persistent StudioRich shell/runtime" below means the
same thing [../home/README.md](../home/README.md) calls "persistent HOME" —
the development-only top-level document that owns cross-surface navigation
(see that page for its own HOST-00–03 history). This page uses "shell/
runtime" specifically to keep that concept distinct from any possible
future HOME *product* surface (a user-facing page/panel) — no such product
surface exists yet; nothing here should be read as implying one does.

Where the actual playback engine lives now DEPENDS on whether MAP/BLACKBOOK
are running standalone or hosted by the persistent shell:

```
Standalone MAP or standalone BLACKBOOK (no persistent shell present)
  radioChannelReceiverRuntime.ts constructs its OWN local
  createRadioChannelReceiver() instance -- exactly the pre-RADIO-01
  behavior, unchanged. This engine dies with the document/tab.

Hosted MAP or hosted BLACKBOOK (persistent shell active)
  radioChannelReceiverRuntime.ts detects hosting (explicit, query-based --
  never bare window.self !== window.top) and requests a handle to the
  shell's OWN persistent RADIO session (music/src/home/homeRadioSession.ts)
  via a new HomeSurfaceHost method, getRadioSession -- gated by MOUNT
  identity (runtime + navigation generation) only, deliberately NOT the
  full route/Artwork identity, so a BLACKBOOK Artwork-only route sync can
  never invalidate an already-granted handle. The underlying engine
  (createRadioChannelReceiver(), the SAME factory the standalone case
  calls locally -- never a second/parallel implementation) is constructed
  lazily, at most once, and reused verbatim across every later surface
  swap for the persistent shell document's own lifetime. Replacing the
  active child surface (MAP <-> BLACKBOOK) never destroys or recreates it.
  A session request the shell rejects (stale/wrong mount identity, or the
  shell not yet "active") fails EXPLICITLY -- the hosted document's own
  receiver becomes a stand-in that always reports {status:"failed"} and
  never plays anything; it NEVER falls back to constructing a local
  engine, which would create a second, competing playback owner.
```

RADIO OFF still means genuinely stop/destroy in both cases -- no paused
position is ever preserved, hosted or not, and a later ON always
re-resolves the Channel's current shared-clock position. Surface
detach/navigation is explicitly NOT equivalent to RADIO OFF: swapping the
active child surface while the persistent shell's session is ON leaves it
ON, unaffected, exactly as verified in this checkpoint's own browser
acceptance (below).

The user-gesture/autoplay constraint HOST-00 already proved for the
persistent shell (a same-origin, synchronous parent-owned call from a
child's own click handler, no `await`/message/timer before the parent's
own engine construction) applies unchanged here: a hosted `turnOn()` call
reaches the shell's session via an ordinary synchronous function call
across the window boundary, so `DualDeckPlaybackEngine.primeForUserGesture()`
still executes inside the original click's own call stack.

Verified via real Chrome acceptance against the local emulator-only HOST
environment: MAP → real Google popup sign-in → BLACKBOOK → MAP preserved
one persistent shell runtime throughout (see
[../home/README.md](../home/README.md)'s own HOST-03B acceptance table);
this RADIO-01 checkpoint additionally verified that turning RADIO ON in
hosted MAP, then navigating MAP → BLACKBOOK → MAP, left the SAME session
state visible on both surfaces without ever resetting to OFF — BLACKBOOK's
own RADIO widget reflected the shell's already-in-flight resolution result
immediately on mount, with no click required. (The local emulator has no
seeded `radioChannels`/`radioPrograms` data, so the observed steady state
was `{status:"failed", reason:"channel-not-found"}` rather than audible
`{status:"on"}` playback -- this proves session/ownership continuity, not
human audible continuity, which automation cannot claim on its own.)

MAP owns no clock, no Program/track resolver, no playback-position
authority of its own — every decision is delegated to the existing RADIO
resolver chain (`resolveChannelTrackBroadcast` / `resolveChannelRotation`).
Turning MAP's receiver OFF and back ON always re-resolves the Channel's
*current* shared-clock position — no locally-remembered pause offset is
ever preserved (verified: OFF resets to `currentTime: 0`; a later ON after
real elapsed time rejoins far past that reset point, not at 0 and not
resumed from where it stopped).

"● LIVE RADIO" reflects the Channel's own `status` field (polled every 10s
via the existing `getRadioChannel` read — no new resolver), independent of
whether MAP's own receiver is ON or OFF — a visual toggle is never treated
as broadcast authority.

Volume is personal, local-only state (`localStorage` key
`wos:radioChannel:volume`), applied via a new, narrow
`DualDeckPlaybackEngine.setMasterVolume()` method that sets the two
persistent `<audio>` elements' own `.volume` directly — a separate
multiplicative layer from the crossfade `GainNode` automation, never
touching transition timing.

Now Playing display is a new, separate transient HUD
(`wos-now-playing-radio`) — reusing `nowPlayingHud.js`'s own visual/CSS
conventions but **not** extending that file, since its own header
explicitly scopes it to MUSIC's local `playbackAuthority.ts` snapshot only
("MUST NOT... read any other MUSIC/RADIO state"). Extending it would have
mixed two separate authorities into one display; a second, RADIO-scoped
HUD following the same pattern preserves that boundary.

Not yet done, deliberately out of this batch's scope: Waveformer
integration (reflecting live RADIO activity visually) — the boundary was
not investigated deeply enough to wire cleanly without risking scope creep;
treat this as the immediate presentation follow-up, not evidence that no
suitable integration point exists.

## BLACKBOOK is a second receiver of the same broadcast

BLACKBOOK (`music/blackbook.html`) is now a real receiver too — the exact
same `radioChannelReceiverRuntime.ts` bridge MAP uses, imported directly
as a real ES module (BLACKBOOK is a real Vite/TS page, unlike `wall/`, so
no `window.SBE` indirection is strictly needed, though the module still
publishes there too for consistency):

```
music/src/member/radioChannelReceiverRuntime.ts   (identical import, same
  channelId "studiorich-radio" — no second Channel, no second receiver
  implementation)
        ↓
music/src/member/blackbookRadioUI.ts   (BLACKBOOK's own thin wiring,
  mirroring radioChannelHud.js's exact behavior for MAP)
```

This replaces BLACKBOOK's previous top-left music control, which was wired
to `eventMusicRuntime.ts` (the separate `eventProgram/current` system,
empty in production — "Event music unavailable"). `eventMusicRuntime.ts`
itself is untouched and remains a real, separate, documented system (see
DEBT.md); it is simply no longer referenced from `blackbook.html`.

**MAP and BLACKBOOK are two independent receivers of the one
`studiorich-radio` broadcast — never two authorities.** This still holds
under RADIO-01: hosted or standalone, there is still only ever ONE
playback-owning engine at a time, its identity just differs by context
(each standalone document's own local engine, vs. the persistent shell's
one shared engine — see "Persistent ownership under the StudioRich shell"
above).

**Standalone** (pre-RADIO-01 behavior, unchanged): entering BLACKBOOK with
RADIO already ON in standalone MAP does not carry a playback session
across (an ordinary top-level navigation to a different document means
only one page-level engine ever exists at a time, by design); turning
BLACKBOOK's own receiver ON resolves the *current* shared position
independently and lands on the same track MAP was playing, correctly
advanced by real elapsed time — never restarting the track at 0. The same
OFF→wait→ON rejoin-at-current-position behavior already proven for MAP
holds identically for BLACKBOOK, because both call the exact same
`resolveChannelTrackBroadcast` chain against the exact same Firestore
Channel — agreement is structural, not coordinated between the two pages.

**Hosted** (RADIO-01): the opposite is now also true and by design — a
session already ON in hosted MAP DOES carry across into hosted BLACKBOOK
(and back), because both are, in that context, thin proxies for the exact
same persistent-shell-owned engine, not two independent local ones.

## Local RADIO acceptance procedure (dev/emulator-only)

The local emulator normally has no `radioChannels`/`radioPrograms` data, so
a fresh local HOST environment resolves `{status:"failed",
reason:"channel-not-found"}` rather than playing anything. To get a real,
audible local broadcast for acceptance testing (no production access, no
new RADIO architecture):

1. An already-exported local package already exists on disk at
   `library/music/RadioWebExports/<slug>/v<n>/` (e.g. `soft-motion-radio/v1`
   — real `.opus` audio, a real `radio-manifest.json`) from a prior MUSIC
   "Send to RADIO" publish run. Served locally, dev-only, by the existing
   `/radio-web-export/` Vite middleware — never reachable from production,
   never the canonical public package URL (see "Public package addressing"
   above).
2. **Known gotcha**: that middleware resolves its library root relative to
   the *actual Node process* working directory, not `music/`. If
   `tools/host-02/server.mjs` is launched from the repo root (as its own
   documented usage shows), pass `PLAY_LIBRARY_ROOT` explicitly, e.g.
   `PLAY_LIBRARY_ROOT="$(pwd)/library/music" node tools/host-02/server.mjs`
   — otherwise the local package 404s. Not a code defect; nothing in the
   repo needed to change.
3. With the Firestore/Auth emulators and `tools/host-02/server.mjs` running,
   sign in as the one allow-listed operator email
   (`STUDIO_RICH_OPERATOR_EMAILS`, `richardjlau@gmail.com`) against the
   **emulator only**, then call the EXISTING repository functions directly
   (`createFirebaseEventRadioRepository().createRadioProgram(...)` with
   `manifestBaseUrl` pointed at the local `/radio-web-export/...` URL, then
   `createFirebaseRadioChannelRepository().createRadioChannel(...)`/
   `updateRadioChannel(...)` to put that Program in an active
   `studiorich-radio` rotation). No UI currently exposes "create a Program
   from an arbitrary manifest URL" end to end — see the RADIO β0.1 operator
   recon below for the gap this reveals. This is exactly what the
   `channel-control.html`/RADIO Publish panel machinery already does
   server-side; nothing new was built, just invoked directly against the
   emulator for a one-off local acceptance pass, never committed as a
   script.
4. Reload the local HOME/MAP page — RADIO ON now resolves to real
   `{status:"on", nowPlaying:{title, artist}}` and plays real audio.

Human audible acceptance using exactly this procedure — see "Human audible
acceptance" in [../home/README.md](../home/README.md)'s own RADIO-01
section.
