# HOME — current architecture and HOST-01 status

HOST-01 is implemented as an opt-in development skeleton. It hosts only controlled
same-origin test surfaces. Real MAP, BLACKBOOK, MEMBER and RADIO are not migrated.
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

Run MUSIC's Vite dev server and open `/home-dev.html?surface=map`.
The only model destinations are `{surface:"map"}` and
`{surface:"blackbook", artworkId?:string}`. Unknown fields, arbitrary URLs,
invalid identifiers and invalid local query strings are rejected. An empty query
bootstraps MAP; an invalid query fails closed. No Firebase or media dependency is loaded.
Existing `memberHomeUI.ts` remains a MAP-local dialog. Existing top-bar navigation
is a MUSIC UI helper, not this host's routing authority; neither was modified.

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
history. Mismatch hides the child and exposes a deterministic failure; a five-second
timeout handles missing readiness. There is no automatic retry loop. An explicit
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

Real Chrome acceptance used trusted clicks in the existing local profile at
`127.0.0.1:5210`, exercising the actual HOME implementation with deliberately
controlled fixtures. The CSS fix triggered a development reload between the two
recorded UUID sequences; no persistence claim crosses that reload.

Not verified: Safari/Firefox/mobile, hostile child navigation, real MAP/BLACKBOOK
integration or production route serving. No autoplay experiments were repeated.
Prior HOST-00 harness and evidence remain untouched. Existing public behavior is
preserved by isolation and regression tests, not claimed as a new live production test.

Temporary debt: dev-only URL/fixture contract, fixture remount on artwork changes,
and lifecycle without domain-specific save/drain. See ../DEBT.md. HOST-02 is safe
to begin only as its separately scoped real-MAP checkpoint using this authority;
its integration still needs live verification. HOST-02 has not begun. No deployment,
Firebase writes, production access or routing changes occurred.
