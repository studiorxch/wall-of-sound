# HOME — current architecture and HOST-02 status

HOST-02 replaces HOST-01's Surface A test fixture with the real MAP/SUBWAY document,
loaded same-origin through the existing `/wall-app` dev proxy. BLACKBOOK remains a
controlled fixture (not yet the real document). MEMBER and RADIO are not migrated —
MAP and BLACKBOOK retain independent document-owned RADIO receivers. Production
canonical routing remains future work. The full persistent-host proposal remains
unimplemented beyond this bounded checkpoint.

## Implementation and ownership

- `music/home-dev.html`: local HOME entry, one persistent runtime UUID and one iframe.
- `music/home-surface-dev.html`: controlled A/B fixture; neither is a production Rollup input.
- `music/src/data/homeRouteTypes.ts`: route, readiness and lifecycle data.
- `music/src/logic/home/homeRoutes.ts`: strict pure validation, parsing, serialization,
  route keys and expected readiness identity. Route identity is separate from iframe URL.
- `music/src/logic/home/homeNavigation.ts`: parent-owned state and navigation authority;
  browser history, mounting and rendering are injected ports.
- `music/src/home/homeRuntime.ts`: DOM/history adapter and persistent parent runtime.
- `music/src/home/homeSurfaceContract.ts`: synchronous same-origin version-1 contract.
- `music/src/home/host01Surface.ts`: controlled child and diagnostic actions.
- `music/src/logic/home/homeNavigation.test.ts`: 32 focused cases.
- `wall/systems/runtime/WosEndpointGuard.js`: adds a fourth endpoint role,
  `wall_home`, detected only from an explicit, validated same-origin identity
  query (`?host=home&homeRuntime=...&homeNavigation=...`) plus a live
  `parent.StudioRichHome.version === 1` check — never mere `iframe` detection,
  which stays `wall_embedded`'s own signal for legacy PLAY/MUSIC embeds.
- `wall/systems/presentation/homeMapSurface.js`: the one narrow MAP-side HOME
  adapter. Waits for the real `MapboxViewportRuntime.onReady` (the existing
  rendering-authority signal, not a new boot/poll loop) before reporting
  `StudioRichHome.ready(...)` once; exposes `HomeMapSurface.requestNavigate`
  for other WALL scripts (e.g. the BLACKBOOK nav link) to hand HOME a
  navigation request instead of navigating the child document directly.
- `wall/systems/presentation/subwayBlackbookNavLink.js`: under `isHome`,
  intercepts its own anchor's click and delegates through
  `HomeMapSurface.requestNavigate` instead of following the anchor natively;
  standalone/embedded keep the original plain anchor, unmodified.
- `wall/index.html`: `wos-embed` class and the PLAY-command heartbeat bridge
  both gain an `!isHome` guard, so a HOME-hosted MAP is never mistaken for a
  legacy embedded/PLAY-controlled surface. `WosEndpointGuard.js` now loads
  before the embed-detection inline script (order matters: the guard must
  exist first).
- `tools/host-02/server.mjs`: local-only acceptance server. Binds to
  `127.0.0.1:5220`, hard-fails before serving if the Firestore/Auth emulators
  (`127.0.0.1:8080`/`9099`) aren't already reachable, and only ever injects
  demo/emulator Firebase env values — it cannot reach production.

Run MUSIC's Vite dev server and open `/home-dev.html?surface=map`.
The only model destinations are `{surface:"map"}` and
`{surface:"blackbook", artworkId?:string}`. Unknown fields, arbitrary URLs,
invalid identifiers and invalid local query strings are rejected. An empty query
bootstraps MAP; an invalid query fails closed. No Firebase or media dependency is loaded.
Existing `memberHomeUI.ts` remains a MAP-local dialog. Existing top-bar navigation
is a MUSIC UI helper, not this host's routing authority; neither was modified.

`childUrl()` (`homeRuntime.ts`) now branches on `route.surface`: `"map"` loads
`/wall-app/` (the real WALL document, same-origin via the existing dev proxy;
production needs an equivalent same-origin rule, unchanged from HOST-01's own
proxy note) with `host=home` plus the runtime/navigation identity in its query;
`"blackbook"` is unchanged from HOST-01 — still the controlled fixture. The
readiness timeout is 30s for `"map"` (real MAP boot, including Mapbox tile
load, is slower than a fixture) vs. 5s for the fixture, unchanged. Because the
real MAP document reports readiness asynchronously (after `homeMapSurface.js`'s
own `MapboxViewportRuntime.onReady`, not merely on HTML `load`), the parent's
`load` handler now also waits for `documentElement.dataset.homeReady` to be
populated before treating a same-expected-document load as inconclusive,
rather than racing it.

## Navigation, readiness and lifecycle

The child calls `window.parent.StudioRichHome.requestNavigate(document, identity,
destination)` or `replaceArtwork(document, identity, artworkId)` synchronously.
Only the current, active document with the exact expected URL and identity can
request navigation. Obsolete document closures are rejected.

HOME pushes cross-surface routes into its own local URL, replaces artwork-local
state, and restores its authoritative route on `popstate` without writing history.
Children load through `location.replace`, avoiding ordinary iframe navigation.
Retry also does not write history. Reload creates a new runtime from the URL.

The lifecycle is leave → mount → ready → active. HOME owns the stable runtime;
children own only their replaceable fixture document. Leave hides the slot and
cancels its timer. Mount advances a navigation generation. Readiness matches
runtime UUID, navigation generation and route key, plus the actual child document
URL. Both the synchronous report and actual iframe load are checked, addressing
the HOST-00 restoration constraint. Duplicate readiness does not remount or write
history. Mismatch hides the child and exposes a deterministic failure; a
readiness timeout handles missing readiness (five seconds for the BLACKBOOK
fixture, thirty for the real MAP document — see the `childUrl()` note above).
There is no automatic retry loop. An explicit
retry remounts the expected route. There are no hypothetical HOME service owners.
This same-origin cooperative contract is not a security boundary against hostile scripts.

## HOST-01 verification — 2026-09-28

| Check | Result / evidence |
|---|---|
| Existing baseline | 48 tests passed: topBarNavigation + blackbookArtworkBridge |
| Final scoped tests | 80 passed in 3 files: 32 HOME + 48 existing |
| Typecheck | `npm run typecheck` passed; corrected six new API parameter annotations |
| Production build | `npm run build` passed; existing dynamic-import/chunk-size warnings; Wall validation: 480 mirrored files, 451 references |
| Chrome A → B → A → Back → Forward | PASS: UUID `3c9c3c7c-aa97-476e-a383-34117da97b10`, generations 2–6, restored B/A active |
| Duplicate ready / invalid destination | PASS: generation 6 and mounts 6 unchanged; invalid destination rejected |
| Readiness mismatch | PASS after fixing iframe hidden CSS: failed `surface_identity_mismatch`, slot invisible, no automatic remount |
| Explicit retry | PASS: UUID `3718c202-3d84-46fc-a3b7-790985adaa6a` unchanged, generation 1 failed → 2 active |
| Artwork A → B | PASS: parent URL replaced; Back returned directly to MAP, Forward to artwork B; same UUID, generations 4–7 |
| Reload local route | PASS: artwork B restored active; new UUID `c4fbf981-7bc0-4cee-a84a-08f653f7d60b` as expected |
| Console inspection | No captured warning/error messages in acceptance tab |

## HOST-02 verification — 2026-09-28

Surface A is now the real MAP/SUBWAY document (`/wall-app/`, real Mapbox
viewport, real SUBWAY line/station rendering); Surface B stays the HOST-01
BLACKBOOK fixture. `tools/host-02/server.mjs` is the local-only acceptance
server — binds `127.0.0.1:5220`, fails closed before serving if the
Firestore/Auth emulators aren't already reachable, and only ever injects
demo/emulator Firebase env values.

| Check | Result / evidence |
|---|---|
| Real SUBWAY-in-HOME | PASS: real MAP document (Mapbox tiles, live SUBWAY line/station rendering, RADIO HUD, BLACKBOOK/SIGN IN chrome) loads and reaches `active` inside HOME's iframe at `home-dev.html?surface=map` |
| MAP → BLACKBOOK fixture navigation | PASS: `subwayBlackbookNavLink.js`'s intercepted click under `isHome` routes through `HomeMapSurface.requestNavigate` to HOME, not a native anchor navigation |
| Persistent HOME UUID through Back/Forward | PASS: one runtime UUID held across MAP ⇄ BLACKBOOK-fixture navigation |
| Pointer interaction / MEMBER input | PASS: pointer input reaches the real MAP document through the iframe; MEMBER sign-in input accepted |
| Resize (this closure pass) | PASS: mobile (375×812), tablet (768×1024) and desktop viewports all keep the real MAP active and correctly laid out inside HOME; no `visibility`/`hidden` regression from `homeRuntime.ts`'s surface-dependent mount logic |
| Standalone MAP regression (this closure pass) | PASS: `wall/index.html` served standalone (not through HOME) on a separate static server renders full chrome (title, BLACKBOOK link, RADIO/clock HUD); BLACKBOOK link is a plain, uninterecepted anchor (`isHome` correctly false); same console error set (octal-literal syntax error, `setBuildingAuthorityMode` read-only assignment, `BundleLoader` 404s) reproduces identically to HOME-hosted MAP and to pre-existing baseline — not a regression from this batch |
| Final scoped tests | `src/logic/home` 42/42 passed (32 `homeNavigation` + 10 new `homeMapIntegration`, covering endpoint-role detection, identity rejection, real-viewport-readiness gating, and click delegation for home/standalone/embedded) |
| Typecheck | `npx tsc -b` clean |
| Production build | `npm run build` passed; same pre-existing dynamic-import/chunk-size warnings; Wall validation: 481 mirrored files, 452 references |
| Full `music` suite | 3652 tests passed, 7 skipped; 11 pre-existing `machineLife`/`sunoLibrary` test files fail on missing external `WOS-share` manifest fixtures in this checkout — confirmed via `git stash` to fail identically at the pre-HOST-02 base commit, unrelated to this batch |

Console errors observed during MAP-in-HOME acceptance (octal-literal strict-mode
error, a read-only-property assignment in `buildingEditProjectionRuntime.js`,
and `WOS:Wall:BundleLoader` 404s) reproduce identically in standalone MAP and
are confirmed pre-existing, not introduced by HOST-02.

Not verified: Safari/Firefox/mobile hardware, hostile child navigation, real
BLACKBOOK document (still the fixture), MEMBER/RADIO migration, or production
route serving. No Firebase writes, production access, or deployment occurred.

Real Chrome acceptance used trusted clicks in the existing local profile at
`127.0.0.1:5210`, exercising the actual HOME implementation with deliberately
controlled fixtures. The CSS fix triggered a development reload between the two
recorded UUID sequences; no persistence claim crosses that reload.

Not verified (as of HOST-01): Safari/Firefox/mobile, hostile child navigation, real
MAP/BLACKBOOK integration or production route serving. No autoplay experiments were
repeated. Prior HOST-00 harness and evidence remain untouched. Existing public
behavior is preserved by isolation and regression tests, not claimed as a new live
production test. Real MAP integration is now verified — see the HOST-02 table above;
BLACKBOOK remains the fixture.

Temporary debt: dev-only URL/fixture contract, BLACKBOOK still a fixture (not the
real document), fixture remount on artwork changes, and lifecycle without
domain-specific save/drain. See ../DEBT.md. A future HOST-03 checkpoint would
replace the BLACKBOOK fixture with its real document and begin MEMBER/RADIO
migration; neither has begun. No deployment, Firebase writes, production access
or routing changes occurred in HOST-01 or HOST-02.
