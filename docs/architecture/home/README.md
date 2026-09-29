# HOME — current architecture and RADIO-01 status

**Terminology.** "Persistent HOME" on this page (and the HOST-00–03/RADIO-01
names) refers to the same thing as "the persistent StudioRich shell/runtime"
used elsewhere (e.g. [../radio/README.md](../radio/README.md)) — the
development-only top-level document that owns cross-surface navigation, the
hosted Google-credential transport, and (as of RADIO-01) the persistent
RADIO session. It is explicitly NOT a user-facing HOME *product* surface
(a page/panel a member would visit) — no such product surface exists yet.
This distinction matters going forward: future work may build an actual
HOME product surface ON TOP of this persistent shell, but the shell itself
is infrastructure, not a feature. Historical HOST-00–03 names are kept
as-is; this note is about how to read them, not a rename.

HOST-03 replaces HOST-01/02's remaining controlled BLACKBOOK fixture with the real
`music/blackbook.html` document, alongside HOST-02's real MAP/SUBWAY (`/wall-app`,
via the existing dev proxy). Both of HOME's two surfaces are now real product
documents; no fixture remains in the live navigation path. HOST-03B adds ONE narrow
piece of MEMBER-adjacent infrastructure to HOME itself: a hosted Google-credential
transport (see §"HOST-03B — hosted Google-credential transport" below) — HOME
initiates/completes the Google popup on a hosted surface's behalf and relays back
only an opaque credential; each surface's own `MemberIdentityAuthority` (state,
Firestore member bootstrap, sign-out) is completely unchanged and unmigrated.
RADIO-01 adds a second, symmetric piece of infrastructure: a persistent RADIO
session (see §"RADIO-01 — persistent RADIO session ownership" below) — HOME owns
the ONE playback engine across hosted surface swaps; each surface's own RADIO UI
wiring (`radioChannelHud.js`/`blackbookRadioUI.ts`) is completely unchanged.
Production canonical routing remains future work. The full persistent-host
proposal remains unimplemented beyond this bounded checkpoint.

## Implementation and ownership

- `music/home-dev.html`: local HOME entry, one persistent runtime UUID and one iframe.
- `music/home-surface-dev.html` / `music/src/home/host01Surface.ts`: the HOST-01
  controlled fixture. Kept as historical/diagnostic evidence (its own tests and
  the `replaceArtwork` remount contract it exercises are unaffected), but is no
  longer reachable from `childUrl()` for either surface as of HOST-03 — neither
  route mounts it in ordinary navigation any more.
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
- `tools/host-02/server.mjs`: local-only acceptance server (name predates
  HOST-03; also used for it unchanged). Binds to `127.0.0.1:5220`, hard-fails
  before serving if the Firestore/Auth emulators (`127.0.0.1:8080`/`9099`)
  aren't already reachable, and only ever injects demo/emulator Firebase env
  values — it cannot reach production.
- `music/src/home/blackbookHomeSurface.ts`: the BLACKBOOK-side counterpart to
  `homeMapSurface.js`. Detection is the same explicit query + live
  `parent.StudioRichHome.version === 1` check (never bare `window.self !==
  window.top`, since BLACKBOOK can have other iframe consumers). Written in
  TypeScript, not plain JS, because BLACKBOOK is part of the same MUSIC/Vite
  build as HOME itself (unlike MAP's separate `wall/` bundle), so it reuses
  HOME's own typed route helpers directly. Holds a local, mutable mirror of
  HOME's `state.route` (starting bare, or seeded from a forwarded `?artwork=`
  on a reload/restore of a specific Artwork's HOME URL) so its own identity
  argument to each HOME call stays correctly in sync as the artwork changes —
  see `syncArtworkRoute` below for why this matters.
- `music/src/home/homeSurfaceContract.ts`: gained `syncArtworkRoute` alongside
  the existing `replaceArtwork` (HOST-01 fixture's own host-driven "switch to
  a different document" contract, unchanged, still remounts). `syncArtworkRoute`
  is BLACKBOOK's own report of an artwork identity it ALREADY switched to
  itself, for HOME's URL/history sync only — it can never remount/reload the
  surface, unlike `replaceArtwork`.
- `music/src/logic/home/homeNavigation.ts`: new `syncArtworkRoute()` method,
  additive alongside the existing `replaceArtwork()` (left untouched, and its
  own remount-on-every-change test still passes unmodified). Updates
  `state.route` and writes HOME's top-level URL via `replaceState`, but never
  calls `mount()`/`leave()` — the real BLACKBOOK document/JS context, camera,
  and in-progress authoring state all survive an ordinary PAGES selection,
  exactly like BLACKBOOK's own pre-existing no-reload `openArtwork()` already
  guarantees standalone.
- `music/src/logic/radio/createRadioChannelReceiver.ts` (RADIO-01, new): the
  ONE canonical RADIO receiver factory (extracted verbatim from
  `radioChannelReceiverRuntime.ts`'s former script body) both a standalone
  document and the persistent shell's own session call — never a second
  engine implementation. `createFailedRadioChannelReceiver` is the explicit
  fail-closed stand-in a rejected hosted request uses.
- `music/src/home/homeRadioSession.ts` (RADIO-01, new): the persistent
  shell's own RADIO session manager — lazy, at-most-once engine
  construction, reused verbatim across every hosted surface swap.
- `music/src/home/homeSurfaceContract.ts` / `homeRuntime.ts`: gained
  `getRadioSession`, gated by mount identity only (`HomeMountIdentity`),
  not the full route/Artwork identity `syncArtworkRoute` changes.
- `music/src/member/radioChannelReceiverRuntime.ts` (RADIO-01, rewritten):
  the ONE shared bootstrap script both `wall/index.html` and
  `blackbook.html` load; standalone/embedded behavior unchanged, hosted
  behavior now delegates to the persistent shell's session. See the
  dedicated "RADIO-01" section below for the full design and two real
  defects found/fixed during this checkpoint's own browser verification.

Run MUSIC's Vite dev server and open `/home-dev.html?surface=map`.
The only model destinations are `{surface:"map"}` and
`{surface:"blackbook", artworkId?:string}`. Unknown fields, arbitrary URLs,
invalid identifiers and invalid local query strings are rejected. An empty query
bootstraps MAP; an invalid query fails closed. No Firebase or media dependency is loaded.
Existing `memberHomeUI.ts` remains a MAP-local dialog. Existing top-bar navigation
is a MUSIC UI helper, not this host's routing authority; neither was modified.

`childUrl()` (`homeRuntime.ts`) branches on `route.surface`: `"map"` loads
`/wall-app/` (the real WALL document, same-origin via the existing dev proxy;
production needs an equivalent same-origin rule, unchanged from HOST-01's own
proxy note) with `host=home` plus the runtime/navigation identity in its query.
`"blackbook"` (HOST-03) loads the real `/blackbook.html` the same way — mounted
bare (no `?artwork=`) for an ordinary surface switch, since BLACKBOOK resolves
its own initial Artwork internally exactly as it already does standalone
(URL param / remembered id / fallback); ONLY when the route being mounted
already names an artwork (a direct reload or Back/Forward `restore()` of a
HOME URL like `?surface=blackbook&artwork=X`) does `childUrl()` forward that
same `?artwork=X` into the child URL, so BLACKBOOK's own existing
`resolveInitialActiveArtwork()` picks it up with no new resolution logic.
The readiness timeout is 30s for both real surfaces (real boot, including
Mapbox tiles or BLACKBOOK's own Firestore `listOwnedArtwork` fetch, is slower
than the retired fixture's 5s). Because both real documents report readiness
asynchronously (MAP after `homeMapSurface.js`'s own
`MapboxViewportRuntime.onReady`; BLACKBOOK after its own first stable,
interactive state — signed-in-and-hydrated, or signed-out — never merely on
HTML `load`), the parent's `load` handler also waits for
`documentElement.dataset.homeReady` to be populated before treating a
same-expected-document load as inconclusive, rather than racing it.

BLACKBOOK's own already-resolved Artwork changes (its existing no-reload
`openArtwork()`/PAGES path, `setActiveArtworkIdentity`'s one funnel) are
reported to HOME via `syncArtworkRoute`, never `replaceArtwork` — the surface
reports state it already changed itself; HOME never remounts BLACKBOOK for an
ordinary Artwork switch. Standalone BLACKBOOK is unaffected: `setActiveArtworkIdentity`
still writes its own `?artwork=` via `history.replaceState` exactly as before
whenever `blackbookHomeSurface.ts`'s `isHome` is false.

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
production test. Real MAP and real BLACKBOOK integration are now both verified —
see the HOST-02 and HOST-03 tables above.

## HOST-03 verification — 2026-09-28

Surface B is now the real `music/blackbook.html` document (real Workspace/
Artboard, real drawing toolbar, real PAGES drawer, real Firestore-backed
Artwork persistence) — no fixture remains in HOME's ordinary navigation path
for either surface. `tools/host-02/server.mjs` (name predates HOST-03; used
unchanged) remains the local-only, emulator-gated acceptance server.

| Check | Result / evidence |
|---|---|
| Real BLACKBOOK-in-HOME | PASS: real BLACKBOOK document (Workspace/Artboard dotted outline, PENCIL/PEN/MARKER/MOP/SPRAY/ERASER toolbar, FIT/PAN/UNDO/CLEAR/NEW/PAGES, RADIO HUD, SIGN IN) loads and reaches `active` inside HOME's iframe at `home-dev.html?surface=blackbook`, both directly and after MAP → BLACKBOOK navigation |
| MAP → BLACKBOOK (real, via MAP's own nav control) | PASS: clicking MAP's real `BLACKBOOK` link (not the dev-harness button) reaches real BLACKBOOK; same HOME runtime UUID before/after |
| BLACKBOOK → MAP (real, via BLACKBOOK's own nav control) | PASS: clicking BLACKBOOK's real `MAP` link reaches real MAP/SUBWAY; same HOME runtime UUID before/after |
| HOME identity persistence across a full round trip | PASS: one runtime UUID (`84be7067-db46-4826-8898-2043e6978198`) held across MAP → BLACKBOOK → MAP |
| Back/Forward across MAP ⇄ BLACKBOOK | PASS: Back restored real BLACKBOOK (`active`, same UUID); Forward restored real MAP (`active`, same UUID) — no child-history contamination observed |
| Resize | PASS: mobile (375×812), tablet (768×1024) and desktop all keep real BLACKBOOK `active` with Workspace/Artboard/toolbar correctly laid out; no pointer/canvas mismatch observed |
| Standalone BLACKBOOK regression | PASS: `/blackbook.html` served outside HOME renders identically (full toolbar, Workspace/Artboard, MAP link); the MAP link is confirmed a plain, unintercepted anchor (`href="wall-app/"`) — `blackbookHomeSurface.ts`'s `isHome` correctly false; zero console errors (BLACKBOOK itself never had MAP's pre-existing bundle errors) |
| Artwork URL/reload contract | Verified at the unit level only (see below) — `childUrl()` forwards a route's `?artwork=` into BLACKBOOK's own URL only when one is already present (a reload/restore), letting BLACKBOOK's existing `resolveInitialActiveArtwork()` resolve it with no new logic; live sign-in was blocked (see below), so a real end-to-end reload-with-artwork could not be exercised this pass |
| PAGES / drawing / DELETE / CLEAR / Undo / NEW live acceptance | **Not verified live** — see MEMBER sign-in blocker below. Persistence-layer correctness for CLEAR/DELETE/Spray is instead evidenced by the existing, unmodified, real-emulator-backed `blackbookClearPersistence.emulator.test.ts`/`blackbookDeletePersistence.emulator.test.ts`/`blackbookSprayPersistence.emulator.test.ts`, all passing against the same emulator this pass used |
| MEMBER sign-in (agent-side tooling) | This agent's own sandboxed browser-automation tool consistently failed `signInWithGoogle`'s real popup with `Auth Emulator Internal Error: No matching frame` (a `window.opener`/popup-relay limitation of that tool's multi-tab model, reproduced identically in HOME-hosted BLACKBOOK, standalone BLACKBOOK, and on a fresh HOME runtime — not a HOST-03 code defect on its own). **Real human Chrome acceptance found a genuine, separate defect in this exact area — see "HOST-03 human acceptance" below; do not read this row as "sign-in is safe under HOME."** |
| Focused tests | `src/logic/home` 60/60 passed (44 `homeNavigation`, incl. 2 new `syncArtworkRoute` cases; 16 new `blackbookHomeSurface` covering context detection, standalone no-op, readiness, artwork-route sync, and BLACKBOOK→MAP delegation) |
| Typecheck | `npx tsc -b` clean |
| Production build | `npm run build` passed; same pre-existing dynamic-import/chunk-size warnings; Wall validation: 481 mirrored files, 452 references |
| Full `music` suite | 551 passed, 7 skipped across `src/logic/home src/home src/member src/audio`; no regressions vs. the HOST-02 baseline |
| `git diff --check` | clean |

Not verified: Safari/Firefox/mobile hardware, hostile child navigation, live
PAGES/drawing/DELETE/CLEAR/NEW acceptance (blocked by the sign-in tooling
limitation above), MEMBER/RADIO migration, or production route serving. No
Firebase writes, production access, rules changes, or deployment occurred.

## HOST-03 human acceptance — 2026-09-29 — known defect, real Google popup sign-in

Real Chrome human acceptance (bypassing the agent-side automation limitation
above) found a genuine, reproducible defect this agent's own sandboxed
browser tool could not surface:

| Step | Result |
|---|---|
| HOME starts with real MAP | PASS |
| MAP → BLACKBOOK via MAP's own control | PASS, HOME runtime unchanged |
| Real BLACKBOOK becomes active | PASS |
| MEMBER sign-in (real `signInWithGoogle` popup) inside HOME-hosted BLACKBOOK | PASS -- succeeds, BLACKBOOK stays in the same HOME runtime immediately after |
| BLACKBOOK → MAP via BLACKBOOK's own control, AFTER that sign-in | **FAIL** -- MAP becomes active, but the HOME runtime UUID changes (a brand-new UUID), proving HOME's own top-level document (`home-dev.html`) was recreated during the navigation, not merely the child surface |

**Isolated cause (this agent's own follow-up investigation):** the failure is
specific to the real `signInWithPopup` Google flow, not to being
"signed in" generically. Using `javascript_tool` to sign in the SAME hosted
BLACKBOOK document via `createUserWithEmailAndPassword` against the same Auth
emulator (bypassing the Google popup entirely, otherwise following the exact
same acceptance steps -- MAP → BLACKBOOK, sign in, BLACKBOOK → MAP) did
**not** reproduce the defect: the HOME runtime UUID was provably identical
before and after. This isolates the cause to `signInWithPopup` itself (or the
popup's interaction with BLACKBOOK now always running inside HOME's iframe,
which it never did before HOST-03), not to `syncArtworkRoute`, `openArtwork`,
`setActiveArtworkIdentity`, or the `#map-nav-link` interception this batch
added -- none of which differ between the two sign-in paths.

**This was an explicitly named, pre-existing risk.** `../proposals/HOME_PERSISTENT_HOST_V1.md`'s
own "Final acceptance and unresolved questions" section flagged "auth
popup/persistence in hosted mode" as unresolved before HOST-03 began. Google's
own sign-in popup enforces restrictions on OAuth prompts invoked from within
an iframe (BLACKBOOK's new-as-of-HOST-03 condition), and Chrome's
Cross-Origin-Opener-Policy process-isolation behavior for cross-origin popups
opened from a nested browsing context is a documented source of exactly this
kind of top-level-document-recreation side effect, independent of this
codebase's own navigation logic. This has NOT been proven to be one specific
mechanism yet -- only reproduced, isolated to the popup path, and traced to a
class of known browser/Google-OAuth behavior, not fixed.

**Status: known, disclosed, NOT fixed in HOST-03.** Fixing it would very
likely require changing BLACKBOOK's sign-in flow when HOME-hosted (e.g. a
redirect-based flow with a coordinated top-level completion step) or another
MEMBER-flow design decision -- both explicitly out of HOST-03's own scope
("Do not migrate MEMBER ownership in HOST-03"). Per HOST-03's own stop
condition ("If achieving this requires... MEMBER migration... STOP and report
the blocker"), this is reported rather than silently expanded into a MEMBER
redesign. HOME-hosted BLACKBOOK sign-in must be treated as unsafe for real
product use until a dedicated follow-up checkpoint resolves it; this does not
affect standalone BLACKBOOK (unchanged, never nested) or HOME-hosted MAP's
own separate MEMBER dialog (not yet acceptance-tested against a real Google
popup either -- likely the same latent exposure, unverified).

Temporary debt: dev-only URL/fixture contract (HOST-01's fixture files remain
present but unreachable from ordinary navigation), lifecycle without
domain-specific save/drain (BLACKBOOK already persists per-stroke, not
per-session, so a MAP↔BLACKBOOK surface switch carries the same in-flight-write
risk standalone BLACKBOOK already has on an ordinary link click — not a new
risk this batch introduces; no new leave-barrier was built). See ../DEBT.md.
A future checkpoint would migrate RADIO ownership into HOME; that has not
begun. No deployment, Firebase writes, production access, or routing changes
occurred in HOST-01, HOST-02, or HOST-03.

## HOST-03B — hosted Google-credential transport (2026-09-30)

Implements the narrow model recommended by
[HOST_03A_MEMBER_AUTH_BOUNDARY.md](../proposals/HOST_03A_MEMBER_AUTH_BOUNDARY.md):
**HOME owns only the browser-sensitive popup transaction; each surface's own
`MemberIdentityAuthority` is completely unchanged.** This is not MEMBER
centralization — no member profile, entitlements, sign-out, or Firestore
member data ownership moved. HOME gained exactly one new dependency: its own
Firebase Auth app instance, used solely to run `signInWithPopup` from a
window that (unlike a hosted surface) is never itself nested.

```
child surface (hosted)                 persistent HOME (never nested)
  sign-in click
       │ synchronous, same-origin call (preserves the user gesture)
       ▼
  requestGoogleCredential(source, identity) ──▶ activeCaller() gate
                                                      │
                                                activeCaller() gate again after
                                                the popup resolves (surface_left
                                                if the surface's own navigation
                                                moved on while the user was
                                                completing it)
                                                      │
                                                signInWithPopup(HOME's own auth)
                                                      │
                                              credential.toJSON() (opaque blob)
       ◀──────────────────────────────────────────────┘
  memberIdentity.signInWithCredential(credential)
       │
  the surface's OWN, unmodified MemberIdentityAuthority completes sign-in
```

- `shared/member-identity`: `AuthGateway`/`MemberIdentityAuthority` gained one
  new method, `signInWithCredential(serialized)` — reuses the existing
  `runAuthOperation("googleSignIn", ...)` path, no new state machine.
  `FirebaseAuthGateway.signInWithCredential` reconstructs the credential via
  `OAuthProvider.credentialFromJSON` (the documented generic reconstructor;
  `GoogleAuthProvider` itself has no such static method) then calls Firebase's
  own `signInWithCredential`. New `createFirebaseGoogleAuthPopupInitiator`
  (`firebase/firebaseGoogleAuthPopupInitiator.ts`) is the ONE thing HOME needs:
  reuses the exact same config/app/emulator bootstrap every other consumer in
  the package already goes through (no parallel Firebase init path), exposes
  only `signInWithGooglePopup(): Promise<unknown>` (an opaque `credential.toJSON()`),
  never constructs a `MemberIdentityAuthority` or touches Firestore.
- `music/src/data/hostedAuthTypes.ts` (new): `HostedGoogleCredentialResult`,
  a discriminated `{ok:true,credential} | {ok:false,reason,message?}` — the
  one new typed contract crossing the HOME/surface boundary. Reasons:
  `home_unavailable`, `stale_identity`, `popup_blocked`, `popup_closed`,
  `credential_missing`, `auth_error`, `surface_left`. No silent fallback path
  exists anywhere in this contract or its callers.
- `music/src/logic/home/hostedGoogleAuth.ts` (new): `classifyGoogleAuthPopupError`
  and `performHostedGoogleCredentialRequest` — the pure orchestration/
  classification logic, unit tested without a browser or real Firebase Auth
  (same "logic vs. DOM adapter" split `homeNavigation.ts` already established).
  The identity gate runs BOTH before opening the popup (rejects a stale caller
  outright, never opens a popup for it) AND after it resolves (`surface_left`
  if the surface's own navigation moved on while the popup was open — a
  credential is never handed back to a caller whose context changed).
- `homeSurfaceContract.ts` / `homeRuntime.ts`: new `requestGoogleCredential`
  on `HomeSurfaceHost`, gated by the same `activeCaller()` used for
  `requestNavigate`/`syncArtworkRoute`. `homeRuntime.ts`'s own implementation
  is a thin DOM/Firebase adapter over `performHostedGoogleCredentialRequest`.
- `blackbookHomeSurface.ts` / `homeMapSurface.js`: both gained
  `requestGoogleCredential()`, delegating verbatim to HOME. BLACKBOOK's is
  TypeScript (same MUSIC/Vite build as HOME); MAP's is the plain-JS
  `SBE.HomeMapSurface` object HOST-02 already established, extended with one
  more method — no second MAP-side adapter file.
- `blackbookRuntime.ts` (`memberButton`) / `subwayMemberRuntime.ts` (the
  dialog's `google` action): both branch on hosted-context detection ALREADY
  established by HOST-02/03 (`blackbookHomeSurface`'s `isHome`;
  `window.SBE.HomeMapSurface`'s presence) — never bare
  `window.self !== window.top`. Hosted calls the new transport and completes
  via `signInWithCredential`; standalone/embedded is completely unchanged
  (still calls `signInWithGoogle()` directly). Neither ever falls back to a
  local popup after a hosted failure — every failure surfaces an explicit,
  reason-specific status message instead.

**Agent-side (this pass):** ordinary hosted MAP↔BLACKBOOK navigation (no auth
involved) is unaffected by these changes — re-confirmed via real Chrome
acceptance, one HOME runtime UUID held across a full round trip after this
batch's edits. A real Google popup completing through the new hosted
transport could NOT be agent-verified: this agent's own sandboxed browser-
automation tool cannot open a genuine separate popup window at all — this
was confirmed to be a GENERAL limitation of the tool (not specific to a
nested-iframe caller, as HOST-03A's own investigation had narrowed it to):
triggering the popup from HOME's own never-nested window in this session
produced the identical `window.opener === null` / same-tab-navigation
anomaly HOST-03A observed from BLACKBOOK's nested context.

**Human Chrome acceptance (2026-09-30) — the exact failure sequence HOST-03
originally found is no longer reproducible:**

| Step | Result |
|---|---|
| HOME on real MAP | PASS — `active`, UUID `c2a73228-1b4d-4f39-9616-343fdbb2d387` |
| Real Google popup sign-in initiated from hosted MAP | PASS — real popup opened, completed; MAP's own control changed SIGN IN → MEMBER; ADMIN became visible for the authorized operator |
| HOME runtime UUID after that sign-in | PASS — unchanged (`c2a73228-...`) |
| MAP → BLACKBOOK (MAP's own control) | PASS — real BLACKBOOK active, same UUID, BLACKBOOK observed the authenticated member state |
| BLACKBOOK → MAP (BLACKBOOK's own control) | PASS — real MAP active again, same UUID, authenticated state still visible |

This directly validates the HOST-03B top-level popup coordination path for
**hosted MAP** through the exact `MAP → Google popup → MAP authenticated →
BLACKBOOK → MAP` sequence that previously recreated HOME. **Still
unverified by a human**, so HOST-03B is not yet fully accepted:
(A) a Google popup initiated specifically from hosted BLACKBOOK while
signed out; (B) BLACKBOOK → MAP → BLACKBOOK after a BLACKBOOK-initiated
sign-in; (C) BLACKBOOK's own lifecycle acceptance (draw, PAGES switch,
NEW, CLEAR→Undo, DELETE, reload-with-selected-Artwork) under a hosted,
authenticated session; (D) standalone MAP Google sign-in regression;
(E) standalone BLACKBOOK Google sign-in regression. See
HOST_03A_MEMBER_AUTH_BOUNDARY.md's own status line and DEBT.md's revisit
trigger for the current acceptance boundary.

## RADIO-01 — persistent RADIO session ownership (2026-10-01)

Moves RADIO's active playback/session ownership out of replaceable hosted
MAP/BLACKBOOK documents and into the persistent shell — the first
checkpoint of the ORIGINAL persistent-runtime objective this whole HOST-0x
line exists for (RADIO continuity), now that both hosted surfaces and
hosted MEMBER auth are proven. See
[../radio/README.md](../radio/README.md)'s own "Persistent ownership under
the StudioRich shell" section for the full design and verification detail;
this section covers HOME's own side of the contract.

- `music/src/logic/radio/createRadioChannelReceiver.ts` (new): the ONE
  canonical receiver factory, extracted verbatim from
  `radioChannelReceiverRuntime.ts`'s former top-level script body — same
  engine, same controller, same behavior. Both a standalone document's own
  local instance AND the persistent shell's one shared instance call this
  SAME function; never a second/parallel engine implementation.
  `createFailedRadioChannelReceiver(reason)` is the explicit, fail-closed
  stand-in a hosted document uses when its session request is rejected —
  reports `{status:"failed",reason}` immediately, never plays anything,
  never falls back to a local engine.
- `music/src/home/homeRadioSession.ts` (new):
  `createHomeRadioSessionManager()` — constructs the underlying receiver
  lazily, at most once, and hands out a receiver-shaped `acquire()` handle
  to whichever surface currently holds it. Listener cleanup happens once
  per `acquire()` call (once per new mount), clearing whatever the
  PREVIOUS mount registered — never per individual `subscribe()` call,
  which would incorrectly evict a still-current mount's own second
  listener (this document's own bootstrap keeps a `window.SBE` state
  mirror subscribed AND the surface's UI wiring separately subscribes its
  own `render` — both must coexist for one mount's whole lifetime).
- `homeSurfaceContract.ts` / `homeRuntime.ts`: new `getRadioSession`
  on `HomeSurfaceHost`, gated by a NEW, narrower identity check
  (`HomeMountIdentity` / `activeMount()`) than `activeCaller()` — matches
  only `runtimeId` + `navigationId` (mount generation), deliberately never
  the full route/Artwork identity `syncArtworkRoute` changes without a
  remount. Returns `null` (never a usable fallback) when the caller isn't
  the currently active mount.
- `radioChannelReceiverRuntime.ts` (rewritten as a thin bootstrap): does
  its OWN explicit, query-based hosting detection (self-contained, not
  shared with `blackbookHomeSurface.ts`'s equivalent, since this one script
  runs standalone in BOTH the MAP and BLACKBOOK documents). When hosted,
  retries `getRadioSession()` with a bounded budget (100 × 50ms, matching
  `blackbookRadioUI.ts`'s own existing `window.SBE.RadioChannelReceiver`
  polling budget) before settling on the failed stand-in — needed because
  this script's own `<script type="module">` tag runs well before HOME's
  readiness handshake completes, so an immediate single attempt would
  almost always be (incorrectly) rejected as "not active yet." Neither
  `radioChannelHud.js` (MAP) nor `blackbookRadioUI.ts` (BLACKBOOK) were
  modified — both already tolerate `window.SBE.RadioChannelReceiver` not
  existing yet via their own pre-existing retry loop, so no new "not
  ready" UI state was needed either.

**Verified this pass (real Chrome, local emulator-only HOST environment,
no seeded `radioChannels`/`radioPrograms` data):** turned RADIO ON in
hosted MAP; the shell's session resolved to `{status:"failed",
reason:"channel-not-found"}` (expected — no Channel is seeded locally;
this proves session/ownership continuity, not audible playback, which
requires real broadcast data this checkpoint doesn't set up). Navigated
MAP → BLACKBOOK: BLACKBOOK's own RADIO widget immediately showed that SAME
failed state, with no click, proving it observed the persistent session's
already-in-flight result rather than starting fresh at `{status:"off"}`.
Navigated BLACKBOOK → MAP: same state, same HOME runtime UUID throughout.
Explicit RADIO OFF genuinely stopped the session (`isOn()` false,
`{status:"off"}`), confirmed independently of the failure-path check.
Standalone MAP and standalone BLACKBOOK (visited directly, outside HOME)
both still construct their own local engine and behave exactly as before
this checkpoint.

**Human audible acceptance — PASSED (2026-10-02).** A follow-up preparation
pass seeded the local emulator with a real Program/Channel referencing an
already-existing local package (`library/music/RadioWebExports/soft-motion-radio/v1`,
served via the existing dev-only `/radio-web-export/` route — see
[../radio/README.md](../radio/README.md) for the exact procedure), so a
human could listen rather than rely on the `channel-not-found` proxy above.
Persistent runtime `a6d46deb-3a51-4966-9c16-0d304690a745`. Observed by the
human directly: RADIO remained AUDIBLY continuous across MAP → BLACKBOOK
and BLACKBOOK → MAP — no interruption, no restart, no perceptible
seek/resync, no duplicate/echo playback; the persistent runtime UUID stayed
unchanged throughout; explicit RADIO OFF stopped playback. This closes the
one remaining RADIO-01 acceptance gap — the core invariant ("once RADIO is
ON, hosted navigation must not interrupt/restart/resync it") is now
human-verified, not just structurally proven.

A real defect was found and fixed during this pass's own browser
verification (not merely designed against, actually caught): the FIRST
implementation checked mount identity too early relative to HOME's own
readiness handshake, permanently caching a `stale_identity` failure even
for an eventually-successful mount — fixed by the bounded retry described
above. A second real defect was also found and fixed: the FIRST
`homeRadioSession.ts` design replaced ANY listener on ANY `subscribe()`
call (not just a new mount's own), which silently broke the bootstrap's
own `window.SBE` state mirror the instant the surface's OWN UI wiring
subscribed a second listener on the SAME mount — fixed by moving listener
cleanup to once-per-`acquire()` instead of once-per-`subscribe()`. Both are
covered by new regression tests (`homeRadioSession.test.ts`,
`radioChannelReceiverRuntime.test.ts`).
