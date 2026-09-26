# StudioRich System Registry

Only systems with strong current evidence are listed. See
[README.md](README.md) for what this directory is and isn't.

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
  `shared/member-identity` (Program/Channel repositories), `firestore.rules`
  (`radioPrograms`/`eventProgram`/`radioChannels`), and the separate
  `studiorich-orbital` repository (public hosting).
- **Important persistence**: Firestore `radioPrograms` (Program catalog),
  Firestore `radioChannels` (Channel/rotation authority), Firestore
  `eventProgram/current` (single active event config), the immutable
  `radio-manifest.json` package itself (content authority), and
  `sessionStorage` for personal-resume only (never authority).
- **Primary integration boundaries**: package publication
  (`publish-radio-to-sites.mjs` → `studiorich-orbital`), Program creation
  (from MUSIC's local export state, or from an already-published package
  URL via Event Radio Control's bootstrap path), Channel rotation
  (Channel Control), listener playback (`channelListenerPlayback.ts` +
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
  identity as RADIO (`STUDIO_RICH_OPERATOR_EMAILS`, see OWNERSHIP.md); does
  **not** currently consume RADIO's Channel broadcast state — see DEBT.md.
- **Status**: ACTIVE. See [subway/README.md](subway/README.md) for the full
  map — read that before any SUBWAY-related task. The live SUBWAY runtime
  (`wall/`) and the MUSIC-side station-geometry authoring tool
  (`music/src/ui/maps/StationGeometryEditor.tsx`) are currently unbridged;
  see that page for the full current-state picture.

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
