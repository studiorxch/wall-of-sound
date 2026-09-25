# StudioRich Ownership Registry

Which system/module is canonically responsible for each concern, and its
current status. See [README.md](README.md) for what "current" means here.

## Status vocabulary

- **CANONICAL** — the one authoritative implementation; nothing else should
  duplicate this responsibility.
- **ACTIVE** — in real current use, not necessarily the only thing touching
  this area.
- **LEGACY** — superseded by a CANONICAL mechanism but still present and
  still runs; do not extend it, do not delete it without a separate,
  deliberate migration decision.
- **DEPRECATED** — should not be used for new work; a replacement exists.
- **DORMANT** — present in the codebase, not currently exercised by any live
  path.
- **EXPERIMENTAL** — real code, not yet load-bearing; behavior may change.

## RADIO / MUSIC responsibilities

| Responsibility | Owner | Status |
|---|---|---|
| music/library intelligence | MUSIC (`music/src`) | CANONICAL |
| playlist authoring | MUSIC (`RadioPlaylist`, `music/src/data/radioPlaylistTypes.ts`) | CANONICAL |
| immutable RADIO package | `RadioWebManifest` / export pipeline (`music/src/logic/radio/radioWebBundlePlan.ts`, `radioWebBundleExportOrchestrator.ts`, `music/src/data/radioWebBundleTypes.ts`) | CANONICAL |
| package identity | `{stationId, bundleVersion}` (immutable, embedded in the manifest) | CANONICAL |
| Program identity | `programId` (`generateRadioProgramId()`, independent of package identity) | CANONICAL |
| Channel identity | `channelId` (fixed `"studiorich-radio"` for the first Channel) | CANONICAL |
| Program catalog | Firestore `radioPrograms` (via `EventRadioRepository`) | CANONICAL |
| Channel authority | Firestore `radioChannels` (via `RadioChannelRepository`) | CANONICAL |
| Channel timeline resolution | `resolveChannelRotation` (`music/src/logic/radio/channelRotation.ts`) — the "Channel Clock" | CANONICAL |
| per-Program timeline resolution | `resolveTrackAtProgramOffset` (`music/src/logic/radio/channelTrackPosition.ts`) — the "Program Clock", deliberately separate from the Channel Clock | CANONICAL |
| listener playback | `channelListenerPlayback.ts` driving `DualDeckPlaybackEngine` (`music/src/audio/DualDeckPlaybackEngine.ts`) | CANONICAL |
| Personal resume | `radioResumableSession.ts` (`sessionStorage`) — resume state only, never broadcast authority | CANONICAL |
| MUSIC authoring persistence | MUSIC local state / IndexedDB (`MUSIC_STATE_DB`) | CANONICAL (for authoring only — never a source of truth for anything published) |
| public package hosting | `radio.studiorich.tv` (separate `studiorich-orbital` repository) | CANONICAL |
| Program bootstrap from an already-published package | `music/src/logic/radio/programFromManifest.ts` + Event Radio Control's "Add Published Program" section | ACTIVE — the recovery/bootstrap path, independent of MUSIC's local IndexedDB; the MUSIC Publish panel's own "Create Program" remains the normal path when local publication state exists |
| StudioRich operator identity | `STUDIO_RICH_OPERATOR_EMAILS` (`shared/member-identity/src/data/operatorIdentity.ts`) mirrored by `firestore.rules`' `studioRichOperatorEmails()` | CANONICAL — client copy is UX-only; the rules copy is the real authority, kept in sync by hand |

## Known noncanonical / replaced mechanisms

These exist in the codebase today, are still imported/referenced by current
code, and are **not** being deleted by this registry — they're recorded so
future work doesn't mistake them for the canonical RADIO Channel path.

| Mechanism | Location | Relationship to canonical RADIO | Status |
|---|---|---|---|
| `nowPlayingBroadcastBridge` | `music/src/runtime/nowPlayingBroadcastBridge.ts` | A MUSIC-local "what's playing" bridge, imported by `App.tsx`. Not the RADIO Channel Clock, not fed by `resolveChannelRotation`/`resolveCurrentChannelBroadcast`. | LEGACY |
| `BroadcastSecondaryLayer` | `music/src/ui/BroadcastSecondaryLayer.tsx` | MUSIC's own in-app broadcast HUD UI, imported by `App.tsx`/`BroadcastHudShell.tsx`/`HudOperatorControls.tsx`. Separate from RADIO Channel broadcast state. | LEGACY |
| `BroadcastHudShell` | `music/src/ui/BroadcastHudShell.tsx` | Same MUSIC-local broadcast-HUD family as above, imported by `App.tsx`/`topBarNavigation.ts`/`broadcastIndicatorRegistry.ts`. | LEGACY |
| `DeckBPlayer` | `music/src/ui/DeckBPlayer.tsx` | A duplicate/secondary deck-player UI, imported by `usePreparedPlaybackController.ts`/`stemDownstreamActions.ts`. Distinct from `DualDeckPlaybackEngine`, which is the canonical playback engine every RADIO listener path (including Channel playback) reuses. | DORMANT relative to RADIO — still wired into MUSIC's own prepared-playback UI, not part of any RADIO Channel path. |

None of the above are dead code (all are still imported somewhere in current
`music/src`) — they are architecturally separate from, and should not be
confused with, RADIO's canonical Channel/Program resolution path documented
in [radio/README.md](radio/README.md).
