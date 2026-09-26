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
  own build entry -> assets/radio-channel-receiver-runtime.js)
  constructs the SAME createChannelListenerPlaybackController +
  DualDeckPlaybackEngine channel-radio.html already uses, targeting the
  ONE canonical channelId "studiorich-radio" -- no second Channel identity.
  Publishes window.SBE.RadioChannelReceiver (control: turnOn/turnOff/
  setVolume) and window.SBE.RadioChannelReceiverState (read-only), same
  bridge convention subwayMemberRuntime.ts already uses for
  MemberIdentityState.
        ↓
wall/systems/presentation/radioChannelHud.js   (plain JS, wall/'s own
  runtime) -- reads/controls ONLY through that bridge. Computes nothing
  about Channel/Program/track resolution itself.
```

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
`studiorich-radio` broadcast — never two authorities.** Verified via the
critical synchronization test: entering BLACKBOOK with RADIO already ON in
MAP does not carry a playback session across (same-tab navigation means
only one page-level engine ever exists at a time, by design); turning
BLACKBOOK's own receiver ON resolves the *current* shared position
independently and lands on the same track MAP was playing, correctly
advanced by real elapsed time — never restarting the track at 0. The same
OFF→wait→ON rejoin-at-current-position behavior already proven for MAP
holds identically for BLACKBOOK, because both call the exact same
`resolveChannelTrackBroadcast` chain against the exact same Firestore
Channel — agreement is structural, not coordinated between the two pages.
