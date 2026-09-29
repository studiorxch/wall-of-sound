# StudioRich System Registry

Only systems with strong current evidence are listed. See
[README.md](README.md) for what this directory is and isn't.

## HOME

- **Status**: EXPERIMENTAL, development-only HOST-01 skeleton.
- **Owner**: `music/src/home/homeRuntime.ts`, with pure navigation in `music/src/logic/home/`.
- **Scope**: persistent parent identity and one controlled same-origin surface slot;
  parent owns route/history/readiness. No real MAP, BLACKBOOK or RADIO hosting.
- **Persistence**: local URL route only; runtime identity lasts for the document.
- See [HOME current state](home/README.md). Production routing is unchanged.

## MUSIC

- **Purpose**: library intelligence, playlist authoring, track preparation,
  and the app most StudioRich work happens inside.
- **Canonical owner/location**: `music/` (Vite + React app).
- **Important persistence**: `MUSIC_STATE_DB` (browser IndexedDB) for
  authoring state — playlists, exports, library metadata. Local-only; not
  synced to Firestore.
- **Primary integration boundaries**: exports immutable RADIO packages (see
  RADIO below); reads/writes its own IndexedDB exclusively for authoring
  state; talks to Firestore only through `shared/member-identity` for the
  RADIO/MAP-operator surfaces it hosts (`event-control.html`,
  `channel-control.html`), never for its own library/playlist data.
- **Status**: ACTIVE.

## RADIO

- **Purpose**: publish immutable, versioned audio packages from MUSIC and
  broadcast them deterministically to listeners, independent of any one
  MUSIC browser session.
- **Canonical owner/location**: `music/src/logic/radio/`,
  `music/src/member/{eventControlRuntime,channelControlRuntime}.ts`,
  `shared/member-identity` (Program/Channel/Schedule repositories),
  `firestore.rules`
  (`radioPrograms`/`eventProgram`/`radioChannels`/`radioScheduleBlocks`),
  and the separate `studiorich-orbital` repository (public hosting).
- **Important persistence**: Firestore `radioPrograms` (Program catalog),
  Firestore `radioChannels` (Channel/rotation authority), Firestore
  `radioScheduleBlocks` (Schedule authority — `Program x Channel x start x
  end`, bounded-priority only, RADIO-04), Firestore `eventProgram/current`
  (single active event config), the immutable `radio-manifest.json`
  package itself (content authority), and `sessionStorage` for
  personal-resume only (never authority).
- **Primary integration boundaries**: package publication
  (`publish-radio-to-sites.mjs` → `studiorich-orbital`), Program creation
  (as of RADIO-04, resolved implicitly at scheduling time by
  `resolveProgramForSchedule`, or from an already-published package URL
  via Event Radio Control's bootstrap path — no longer a manual step of
  MUSIC's Publish workflow), Channel rotation (Channel Control), scheduled-
  Program priority (`resolveChannelTrackBroadcastWithSchedule`, RADIO-04),
  listener playback (`channelListenerPlayback.ts` +
  `DualDeckPlaybackEngine`).
- **Status**: ACTIVE. See [radio/README.md](radio/README.md) for the full
  map — read that before any RADIO-related task.

## MAP / SUBWAY

- **Purpose**: StudioRich's geographic/Subway map surface, member artwork
  authoring on that surface, and StudioRich-operator-only map authoring
  (e.g. the Subway map itself) distinct from ordinary member artwork.
- **Canonical owner/location**: `wall/` (the map/Subway runtime — a
  separate, non-Vite JavaScript system from MUSIC), plus
  `music/src/member/mapArtworkBridge.ts` and `shared/member-identity`'s
  Artwork repository (`firestoreArtworkRepository.ts`, `artworkTypes.ts`,
  `artworkDocument.ts`).
- **Important persistence**: Firestore `artworks` collection. A
  `surfaceId` prefix of `map:` denotes the StudioRich-operator-only
  authoring context (`isRestrictedAuthoringSurface`/`isStudioRichMapAuthor`
  in `firestore.rules`); every other prefix (e.g. `blackbook:`) is ordinary
  member-open authoring.
- **Primary integration boundaries**: shares the same StudioRich operator
  identity as RADIO (`STUDIO_RICH_OPERATOR_EMAILS`, see OWNERSHIP.md);
  consumes RADIO through `radioChannelReceiverRuntime.ts` and
  `radioChannelHud.js`. Its receiver is document-owned; navigation to
  BLACKBOOK does not preserve playback. See [radio/README.md](radio/README.md).
- **Status**: ACTIVE. See [subway/README.md](subway/README.md) for the full
  map — read that before any SUBWAY-related task. The live SUBWAY runtime
  (`wall/`) and the MUSIC-side station-geometry authoring tool
  (`music/src/ui/maps/StationGeometryEditor.tsx`) are currently unbridged;
  see that page for the full current-state picture.

## BLACKBOOK

- **Purpose**: StudioRich's art-book / publishing / creative-authoring
  domain — not one HTML page, not WALL, not spraypaint, not SUBWAY
  graffiti. Today this means one fixed page a member draws on with a
  shared set of drawing supplies.
- **Canonical owner/location**: `music/blackbook.html` →
  `music/src/member/blackbookRuntime.ts` (MUSIC's own Vite build), plus
  `blackbookArtworkBridge.ts`/`blankArtworkBridge.ts` and the shared
  Artwork persistence bridge (`mapArtworkBridge.ts`'s
  `createArtworkPersistenceBridge`) also used by MAP paint.
- **Important persistence**: Firestore `artworks`
  (`artworkType: "blank"`, `surfaceId: blackbook:studio-rich-main:page:page-1`
  — one hardcoded Blackbook/page today, not yet multi-page/multi-book).
- **Primary integration boundaries**: relies on MEMBERS for identity, shares
  the Art Supply set and Artwork persistence bridge with MAP paint
  authoring; receives the same RADIO Channel through
  `radioChannelReceiverRuntime.ts` and `blackbookRadioUI.ts`, and links back
  to MAP/SUBWAY by full-document navigation. Its receiver is independent
  of MAP's receiver; neither owns the shared broadcast clock.
- **Status**: ACTIVE for the single current page/drawing use case. See
  [blackbook/README.md](blackbook/README.md) for the full current-vs-
  direction map — read that before any BLACKBOOK-related task, since its
  intended product scope (multi-page art-book, Surfaces, World Layers,
  Read content) is considerably larger than what's built.

## MEMBER IDENTITY

- **Purpose**: the one Firebase Auth-backed identity every StudioRich
  surface (MUSIC, RADIO operator pages, MAP authoring) authenticates
  against. Provides the one StudioRich-operator allowlist backing every
  operator-only capability.
- **Canonical owner/location**: `shared/member-identity` (a separate npm
  package, imported by `music` via a `file:` dependency — its `dist/` must
  be rebuilt after any source change there before `music` picks it up).
  `firebaseAuthGateway.ts` wraps Firebase Auth (Google sign-in,
  `browserLocalPersistence`); `operatorIdentity.ts` exports
  `STUDIO_RICH_OPERATOR_EMAILS`, the one canonical client-side operator
  allowlist.
- **Important persistence**: Firebase Auth itself (not Firestore); Firestore
  `members/{uid}` for member profile data.
- **Primary integration boundaries**: every operator-gated client UI
  (`eventControlRuntime.ts`, `channelControlRuntime.ts`,
  `RadioPlaylistPublishPanel.tsx`, Wall's `subwayMapPaintSurface.js`) reads
  `STUDIO_RICH_OPERATOR_EMAILS` for its own UX-only gate; the real authority
  is always `firestore.rules`' own `studioRichOperatorEmails()`, which must
  be kept in sync by hand — there is no mechanism to share a literal between
  TypeScript and the Firestore rules language.
- **Status**: ACTIVE. See [members/README.md](members/README.md) for the
  full map — read that before any identity/auth/operator-authority task.
  `browserLocalPersistence` is **origin-scoped** — a sign-in on one running
  dev server does not carry over to a different server/port/worktree, even
  when it's the same application's code.
