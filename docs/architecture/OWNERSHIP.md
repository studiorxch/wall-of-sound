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
| Program bootstrap from an already-published package | `music/src/logic/radio/programFromManifest.ts` + Event Radio Control's "Add Published Program" section | ACTIVE — the recovery/bootstrap path, independent of MUSIC's local IndexedDB; the normal path (RADIO-04) is `resolveProgramForSchedule` (`radioProgramLifecycle.ts`), called from `RadioScheduleBlockDialog.tsx` at scheduling time, not from the Publish panel — see [radio/README.md](radio/README.md)'s "Operator playlist/programming workflow" |
| Schedule authority | Firestore `radioScheduleBlocks` (via `RadioScheduleRepository`) | CANONICAL (RADIO-04) — `Program x Channel x start x end`; bounded-priority influence on playback only, never mutates `radioChannels`' own rotation fields — see [radio/README.md](radio/README.md)'s "RADIO Schedule (RADIO-04)" |
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

## MAP / SUBWAY responsibilities

See [subway/README.md](subway/README.md) for the full current-state map.

| Responsibility | Owner | Status |
|---|---|---|
| canonical Subway id minting | `mtaSubwayIdentity.js` (`wall/systems/transit/`) | CANONICAL |
| live train truth/identity | `SubwayLogicalRollingStockAuthority` (`wall/systems/transit/`) | CANONICAL |
| live station place/identity | `MTASubwayStationLibrary` (`wall/systems/transit/`) | CANONICAL |
| Surface Map (2D) rendering | `mtaSubwayMapLayer.js` (`wall/systems/presentation/`) | CANONICAL |
| Underground / Tunnel Vision (3D) rendering | `subway3DTrainActorLayer.js` + `subway3DVisibilityPolicy.js` (`wall/systems/presentation/`) | ACTIVE — dev-flag gated OFF by default |
| track-structure classification (underground/elevated/at-grade/…) | `SubwayTrackStructureAuthority` (`wall/systems/transit/`) | ACTIVE, but DORMANT relative to rendering — zero current consumers |
| subway camera authority | `subwayCameraSunroof.js` (`wall/systems/presentation/`) | EXPERIMENTAL |
| station geometry authority (authored plan/topology) | `stationGeometryStore.ts` / `stationGeometryTypes.ts` (`music/src/data/`) | EXPERIMENTAL, authoring-only — not bridged into `wall/` |
| station archetypes | `stationArchetypeTypes.ts` + `stationArchetypeInstantiate.ts` (`music/src/`) | EXPERIMENTAL |
| station classification grammar | `stationClassificationTypes.ts` (`music/src/data/`) | EXPERIMENTAL — types + tests only, no classifier |
| station editor | `StationGeometryEditor.tsx` (`music/src/ui/maps/`) | EXPERIMENTAL — single-station (Bay Ridge Av) V0 |
| MAP member paint authoring (free drawing) | `subwayMapPaintSurface.js` → Firestore `artworks` (`surfaceId: map:*`) | ACTIVE |
| car-surface graffiti authoring | `SubwayArtworkAuthority` / `SubwayArtworkPlacementAuthority` / `SubwayCarSurfaceAuthority` / `SubwayResidentGraffitiArtistAuthority` (`wall/systems/transit/`) | ACTIVE — separate identity/storage from map paint above |
| RADIO Channel reception (LIVE indicator, RADIO ON/OFF, volume, Now Playing) | `radioChannelReceiverRuntime.ts` (`music/src/member/`) + `radioChannelHud.js` (`wall/systems/presentation/`) | ACTIVE — receiver only, no clock/resolver authority of its own; see [radio/README.md](radio/README.md) |
| Station Cover (representation, V1: Bay Ridge Av; canonical station-information content — also the Mezzanine Drawer's own content as of STATION-04) | `stationTruth.ts` / `stationCoverPresentation.ts` / `stationArrivalPresentation.ts` / `stationLineOrientation.ts` / `stationCoverRuntime.ts` (`music/src/`) + `music/station.html` | ACTIVE — reads `MTASubwayStationLibrary`'s own static snapshot directly, never a second station database; station-ordering-along-route is resolved (`stationLineOrientation.ts`); live arrivals remain an unreachable STOP finding. Reachable standalone (`station.html?station=<id>`), hosted via HOME (`{surface:"station"}`), AND embedded (`?embedded=1`) inside MAP's own Mezzanine Drawer — one implementation, three entry points — see [subway/README.md](subway/README.md)'s "STATION-01" through "STATION-04" sections |
| Mezzanine Drawer (container only) | `subwayMezzanineDrawer.js` (`wall/systems/presentation/`) + `#subway-mezzanine-drawer` (`wall/index.html`) + `--mezzanine-drawer-width` grid column (`wall/styles.css`) | ACTIVE — owns open/close, resizable width (315-540px, 360px default, persisted), and triggering `SBE.WorkspaceViewportSync` after width changes; owns NO station-information rendering of its own (that's Station Cover's iframe content, above), see [subway/README.md](subway/README.md)'s "STATION-04" section |
| MAP selected-station presentation | `subwayStationHud.js` (`wall/systems/presentation/`) | ACTIVE — `#subway-station-identity` now renders ONLY the itinerary-scoped YOUR TRIP boarding section (as of STATION-04); station name/neighborhood/route badges moved to the Mezzanine Drawer, the per-direction detailed arrival board was removed in STATION-03 — see [subway/README.md](subway/README.md)'s "STATION-03"/"STATION-04" sections |

The live runtime authorities above and the MUSIC-side station-geometry
authoring tools are **two disjoint systems** — see
[subway/README.md](subway/README.md)'s §8 for the full persistence/authority
breakdown before assuming either feeds the other.

## BLACKBOOK responsibilities

See [blackbook/README.md](blackbook/README.md) for the full current-vs-
direction map.

| Responsibility | Owner | Status |
|---|---|---|
| Blackbook page authoring (drawing) | `blackbookRuntime.ts` + `blackbookArtworkBridge.ts` (`music/src/member/`) | ACTIVE — one hardcoded page today |
| shared Artwork persistence bridge | `mapArtworkBridge.ts`'s `createArtworkPersistenceBridge` (`music/src/member/`) | CANONICAL — reused by both Blackbook and MAP paint, never duplicated |
| RADIO Channel reception (BLACKBOOK) | `radioChannelReceiverRuntime.ts` (shared with MAP) + `blackbookRadioUI.ts` (`music/src/member/`) | ACTIVE — a second independent receiver of `studiorich-radio`, never a second implementation; see [radio/README.md](radio/README.md) |
| shared Art Supply set | `shared/member-identity/src/data/artSupplyTypes.ts` | CANONICAL — the one supply set every drawing surface (Blackbook, MAP paint) reuses |
| Surface identity (`surfaceId`) | real, required, immutable field on every Artwork (`firestore.rules`) | CANONICAL as a field; the generalized `surfaces/` namespace itself is DIRECTION, not built |
| multi-page/multi-book Blackbook, Read content, World Layers, Access-vs-Visibility | not implemented | DIRECTION — see [blackbook/README.md](blackbook/README.md) |

## ADMIN

See [admin/README.md](admin/README.md) for the full control-plane map.

ADMIN is a sibling of MEMBER in the global account/navigation layer, not a
descendant of it: MEMBER is identity/entitlement for the creative products
(MAP, BLACKBOOK, RADIO listening); ADMIN is StudioRich's own operational
control plane over those same products (RADIO ops, future SUBWAY/BLACKBOOK/
MUSIC ops). Both read the same underlying Firebase Auth identity
(`MemberIdentityState`) — ADMIN is not a second identity system, it is a
visibility+authority distinction layered on the one identity Member already
has.

| Responsibility | Owner | Status |
|---|---|---|
| ADMIN shell/tab composition | `music/admin.html` + `adminShellRuntime.ts` (`music/src/member/`) | ACTIVE — UI-only operator gate (`STUDIO_RICH_OPERATOR_EMAILS`); real authority remains `firestore.rules`' `isEventOperator()` inside each composed page |
| MAP → ADMIN nav entry (sibling of the MEMBER button) | `ensureAdminLink()`/`renderAdminLinkVisibility()` (`subwayMemberRuntime.ts`) | ACTIVE — same `STUDIO_RICH_OPERATOR_EMAILS` UI-only gate; opens `admin.html` in a new tab (no DualDeckPlaybackEngine of its own, so no risk to MAP's own RADIO receiver) |
| RADIO Program workspace | same-origin iframe of the existing, unmodified `event-control.html` | CANONICAL implementation reused, not rebuilt |
| RADIO Channel workspace | same-origin iframe of the existing, unmodified `channel-control.html` | CANONICAL implementation reused, not rebuilt |
| RADIO operator entry point (from ADMIN) | ADMIN's RADIO tab → Program pane (`event-control.html`) + Channel pane (`channel-control.html`) | CANONICAL — the one operator path; not duplicated elsewhere in ADMIN |
| SUBWAY / BLACKBOOK / MUSIC ops sections | not implemented | DIRECTION — see [admin/README.md](admin/README.md)'s information architecture; β0.1 scope is RADIO only |

## HOME development skeleton

| Responsibility | Owner | Status |
|---|---|---|
| Persistent local HOME runtime / surface slot | `music/src/home/homeRuntime.ts` | EXPERIMENTAL |
| HOST-01 route, history decisions and readiness lifecycle | `music/src/logic/home/homeNavigation.ts` + `homeRoutes.ts` | EXPERIMENTAL |

These own only controlled HOST-01 surfaces; existing MAP/BLACKBOOK document and
RADIO ownership remains unchanged. See [HOME](home/README.md).
