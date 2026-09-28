# STUDIORICH HOME — persistent host V1 proposal

Status: **PROPOSED / NOT IMPLEMENTED**. Documentation checkpoint, 2026-09-27.
Baseline: `release/subway-beta-0.1`, implementation commit `c71ca04`.
This is the designated proposal and migration contract, not current-state
registry truth. HOST-00 has isolated desktop-Chrome feasibility evidence with constraints;
no production HOST or RADIO migration stage is complete. Implementation
requires separate checkpoints; this document does not authorize deployment.

## Current topology and problem

- MAP/SUBWAY is `wall/index.html`, served at `/wall-app/`; SUBWAY is the
  default mode. BLACKBOOK is `music/blackbook.html`, with its own Vite entry.
- `wall/systems/presentation/subwayBlackbookNavLink.js` creates an ordinary
  same-tab `../blackbook.html` anchor. BLACKBOOK's MAP anchor is `wall-app/`.
  Both replace the top-level document.
- Both load `music/src/member/radioChannelReceiverRuntime.ts`. Its module
  owns the receiver state/controller/engine in that document. ON constructs
  `DualDeckPlaybackEngine` (two persistent audio elements, one AudioContext);
  OFF destroys it. Navigation ends the owning document's active lifecycle.
- The shared source implementation does not mean a shared runtime instance.
  Destination receivers start OFF. Local volume survives through
  `wos:radioChannel:volume`; shared broadcast position is resolved anew on ON.
- MAP controls use `radioChannelHud.js`; BLACKBOOK uses `blackbookRadioUI.ts`.
  Both consume `window.SBE.RadioChannelReceiver`. Neither owns a clock.
- `memberHomeUI.ts` is a MAP-local dialog, not a persistent HOME host.
  Firebase auth persistence is not persistent JavaScript/audio ownership.
- `/wall-app` is a Vite proxy in development and a copied directory in the
  production build (`music/vite.config.ts`). Existing MUSIC Wall frames and
  ADMIN's operator frames are not member HOME navigation infrastructure.
- `music/public/_redirects` currently redirects `/` to
  `/wall-app/?mode=subway` and has a catch-all to MUSIC's `/index.html`.
  No explicit extensionless `/blackbook` route is declared there. Do not
  claim that the catch-all is a BLACKBOOK route or a HOME router.

Primary current-state references: [RADIO](../radio/README.md),
[MEMBERS](../members/README.md), [BLACKBOOK](../blackbook/README.md),
[SUBWAY](../subway/README.md), [deployment](../DEPLOYMENT.md).

## Decision: persistent parent, one replaceable same-origin surface frame

HOME owns a small route controller, one surface slot, and one RadioSession.
The slot holds MAP or BLACKBOOK as a real document; it does not transplant
DOM or scripts. Replacing a child must never replace the parent audio objects.
One mounted surface at a time; do not retain hidden MAP/BLACKBOOK runtimes.
HOME remains separate from MUSIC's authoring app and ADMIN.

| Concern | Same-origin iframe V1 (selected) | Mountable modules | Incremental hybrid |
|---|---|---|---|
| Rewrite | Narrow entry, navigation, service, and leave adapters | MAP globals/scripts and BLACKBOOK top-level DOM listeners need mount/unmount conversion | Keep frames now; allow a later independently justified module adapter |
| Existing embedding | Must distinguish HOME from PLAY/OBS | Remove dependency on embedding for these views | Existing PLAY embeds stay on their own contract |
| Canvas/pointers | Retain child coordinates, pointer capture, canvas renderers | Recheck CSS/global/input collisions | No mixed rendering implementation in V1 |
| Keyboard/focus | Child owns local shortcuts; explicit entry focus; normal Tab traversal | Central focus/event arbitration required | Future adapters must satisfy the same focus contract |
| Responsive sizing | Frame fills slot; child resize handling remains authoritative | Shared layout can disturb canvas sizing | Same viewport contract |
| History/deep links | Parent History API plus controlled child replacement | Parent History API; surface state becomes route input | One route authority regardless of adapter |
| MEMBER | Reuse current per-document identity consumers | Could share authority instance, but requires wider migration | Identity ownership can evolve separately |
| RADIO | Synchronous same-origin service facade | Direct service dependency | Same parent-owned API |
| Activation | Direct call from trusted child click, experimentally gated | Same-document click is simpler | Never async-message ON merely for uniformity |
| Cleanup | Explicit detach; document removal reclaims local runtime | Must enumerate every timer/listener/renderer disposer | Do not build a general plugin framework now |
| Extensibility | New trusted first-party frame implements small contract | New modules easier after conversion | Future option, not two V1 hosting implementations |
| Deployment | Explicit public host entries and internal surface entries | Same public host entries, larger application bundle changes | Preserve one public URL contract |

Frames minimize renderer/authoring changes, not all integration work. The
history and activation experiments below are release gates, not assumptions.
Same-origin frames are trusted application code, not a security isolation
boundary. No cross-origin surface support or arbitrary iframe URL API in V1.

## Public URLs, document delivery, and history

HOME exclusively owns top-level history. Public URLs remain meaningful:
`/wall-app/` (and existing MAP query parameters), `/blackbook.html`, and
`/blackbook.html?artwork=<id>`. `/wall-app/index.html` normalizes with replace
semantics to `/wall-app/`. Add `/blackbook` as an explicit alias to
`/blackbook.html`, preserving query/hash; do not rely on the MUSIC fallback.
Root continues to mean SUBWAY via the existing redirect. Non-SUBWAY explicit
Wall modes remain outside V1 hosting and retain their existing entry behavior.
Navigating to one of those modes is an explicit exit, not promised continuity.

Proposed delivery: generate public entry documents that dispatch to HOME for
these eligible public routes, and separate internal surface entry documents.
Use `/wall-app/home-surface.html` for MAP and `/blackbook-surface.html` for
BLACKBOOK, preserving each original asset-directory base. These paths are
**proposed output names**, not files that exist today. Keep source renderers
where they are; generate from the existing entries rather than maintaining
forked copies. Public entry dispatch must run before any surface/receiver boot.
For non-HOME legacy embeds, entry dispatch retains legacy surface boot.

The build/dev adapters must provide identical routing: serve eligible public
host documents before the Wall proxy, retain internal MAP assets/proxy access,
and emit explicit static entry artifacts in production. Preserve public query
parameters in the child route input. Do not change DNS, CORS, or deploy here.
Internal entries require a verified parent HOME API/registration; direct
visits replace-navigate to the corresponding public URL, never create a
standalone receiver or nested HOME. A query flag alone is not host detection.

| Case | Required behavior |
|---|---|
| Direct MAP | Public entry starts HOME with MAP active; RADIO OFF; stored volume loaded |
| Direct BLACKBOOK | HOME with BLACKBOOK active; existing identity hydration and artwork selection |
| `?artwork=<id>` | Pass through to BLACKBOOK's existing resolver after identity hydration; retain meaningful top URL |
| MAP → BLACKBOOK / reverse | Plain primary click is intercepted by surface adapter; HOME validates route, leaves old surface, pushes one public history entry, mounts destination; RADIO untouched |
| Same current route | No push, no remount, no RADIO operation |
| Back / Forward | HOME handles `popstate`, derives route from public URL, reconciles child without pushing another entry; in-HOME history retains the parent |
| Artwork selection / NEW materialization | BLACKBOOK reports established artwork identity; HOME uses the existing pure URL helper and top-level `replaceState`; no new history entry |
| Reload / copied URL | Public path boots a new HOME and resolves that route; RADIO OFF until explicit ON; volume retained |
| New tab / modified click | Real public href, browser default behavior; independent HOME initially OFF, no copied ON state |
| Exit | External/top-level navigation, tab close, reload, or out-of-scope surface ends this session; Back across that document boundary is recovery, not continuity |

Preserve unrelated query/hash fields when updating artwork identity; strip
internal transport fields from shareable URLs. Use a versioned, minimal
history state (route/navigation id), never auth, audio objects, or a broadcast
cursor. Initialize the first entry with replaceState. The URL is sufficient
when history.state is absent. Top URL/title and displayed surface must agree.

HOST-00 experimentally confirmed the following in desktop Chrome (existing
profile); see [findings and evidence](HOST_00_FINDINGS.md). Ordinary iframe.src
and child links consume Back steps without changing the parent URL. Independent
child location.replace can also restore stale child content on Forward after
parent popstate handling. Therefore ready/load must validate the child route
against the latest parent route/navigation id after traversal; bounded
replacement or explicit error resolves mismatch, never a corrective history
push or unbounded loop. This stronger reconciliation is required in HOST-01,
not implemented by the diagnostic harness.

Child frames must not perform ordinary internal anchor navigation or pushState.
Use replacement navigation for the frame slot, not successive `iframe.src`
assignments that can add joint-history entries. HOME must prove exactly one
Back step per surface change in Chromium, Firefox, and Safari; initial frame
entries/removal and rapid Back/Forward are part of that experiment. A late
ready/identity callback from an old navigation id cannot change the URL.

BLACKBOOK's current `setActiveArtworkIdentity` calls child replaceState.
Hosted mode instead calls HOME's replace-artwork method; standalone legacy
behavior keeps the existing helper. Child-local query may be synchronized by
replace only, never becoming a second history authority. On mount, HOME supplies
the authoritative route. Invalid artwork continues through
`resolveActiveBlackbookArtworkId` (requested valid id, remembered valid id,
existing fallback, or pending-new); do not invent an error-only policy or
bypass ownership checks. Replace the public id when a valid fallback is selected;
remove an unresolved id if no artwork exists, without creating a document.

## Minimal surface contract and navigation lifecycle

Conceptual API, not a new framework or implemented interface:

- `attach(surfaceId, navigationId)` validates current frame identity and returns
  a scoped service/navigation facade. Only the registered same-origin child
  receives it. Protocol mismatch produces an explicit load error.
- `ready(navigationId)` follows required runtime initialization. A load event
  alone is not readiness. Frame load/error/timeout gets a visible retry state.
- `navigate(publicUrl)` requests an allowlisted HOME route. Ordinary links keep
  their real public href for copy/new-tab behavior. No generic top-location API.
- `replaceArtwork(id | null)` is BLACKBOOK-only route state, not data authority.
- `prepareLeave()` finishes/cancels a live pointer gesture consistently with the
  existing surface and awaits tracked authoring writes. Failed saves keep the
  current surface on in-app link navigation and show the existing error.
- `detach()` releases all parent subscriptions/references, then HOME replaces
  the frame document. The child stops local resources; removal is the final
  document lifetime boundary. It never calls RadioSession OFF/destroy.

Do not pretend pending writes can be solved by unloading an iframe. Expose a
narrow pending-write barrier using the existing persistence promises (no second
queue or repository). For browser Back, URL has already changed: hold the old
frame while prepareLeave completes, then reconcile the latest requested route.
If it fails, show a HOME navigation-error state explaining that the unsaved old
surface is retained; Retry continues, Stay replace-restores its public route.
Do not push compensating entries or silently discard work. Rapid navigations
serialize leave work and accept only the latest destination. Full reload/close
cannot guarantee asynchronous save completion; existing persistence truth and
browser-supported dirty-work warning apply, never a fabricated successful save.

Frame fills a `min-width:0; min-height:0` slot without a second document scrollbar.
Canvas dimensions remain child-local. Preserve BLACKBOOK's ResizeObserver and
PAGES drawer geometry; test pointer capture, touch, wheel, zoom, resize, and DPR.
Focus the destination's appropriate landmark after readiness, not on background
RADIO updates. Keep local keyboard shortcuts local and normal accessible Tab
order across the host/frame. No blanket key forwarding.

## Required MAP and BLACKBOOK adaptations

MAP today adds `wos-embed` for any `window.self !== window.top`, or explicit
`embed=1`, `controls=0`, `hud=0`, `chrome=0`. This hides rails, launcher,
drawers/overlays, viewport controls, transport bar, `wos-hud`, Mapbox controls,
and world telemetry/weather/clock. It keeps `wos-nav` and canvas pointers.
The current RADIO and BLACKBOOK link ids are not in that hide list; it is
incorrect to claim all navigation vanishes. Nevertheless ordinary MAP chrome
would change unexpectedly under an unmodified HOME frame.

`wall/index.html` also starts PLAY heartbeat/ping/screenshot/visibility/route-stop
bridges for any parent and intercepts Tab with preventDefault to send
`wall:tab-key`. HOME must not inherit these PLAY behaviors. Introduce an explicit
verified HOME context that preserves normal member MAP chrome and skips PLAY
bridges/Tab interception. Preserve legacy MUSIC/PLAY/OBS behavior and explicit
presentation flags. Audit other iframe-sensitive code during HOST-02; no global
removal of embed support. Adjust relative member/ADMIN/navigation destinations
only where the new entry requires it; ADMIN still opens separately.

BLACKBOOK has no equivalent iframe-specific mode in its current runtime. Keep
its canvas, tools, PAGES/NEW/CLEAR/DELETE behavior and styling. Add only hosted
entry detection, HOME navigation/artwork-URL adapter, leave barrier, and scoped
RADIO attachment. Its viewport sizing must work inside the slot without new
coordinate math. Both surfaces stop importing the auto-owning receiver when
hosted; failed host attachment must not silently instantiate a local engine.

## Proposed RadioSession ownership

HOME creates one service object, initially OFF, with at most one live existing
ChannelListenerPlaybackController/DualDeckPlaybackEngine pair. Extract current
receiver behavior; do not add a second audio engine or broadcast authority.

Proposed snapshot: receiver phase (`off`, `starting`, `on`, `failed`, optionally
`suspended` for observed browser interruption), Channel live indicator, local
volume, existing resolved program/track identity and display metadata, failure
reason, monotonically increasing session revision. Broadcast position remains
computed by the existing authoritative resolver, not a stored playback cursor.
Any recovery indicator reports actual observations, not inferred success.

API: `turnOnFromGesture()`, `turnOff()`, `setVolume(0..1)`, `getSnapshot()`,
`subscribe(listener) -> unsubscribe`, and host-only `destroy()`.

- ON is idempotent while starting/on. It synchronously creates/primes the
  existing engine before async resolution; success/failure updates subscribers.
- OFF invalidates outstanding async work, destroys controller/engine, and emits
  OFF. Later ON creates a fresh pair and rejoins current shared broadcast time.
- Use an operation generation token so OFF, failure/retry, or destruction cannot
  be overwritten by stale play/metadata completions. Failed engines are released
  before retry; never two active pairs. This closes extraction-time lifecycle
  races, not a change to synchronization mathematics.
- Volume is session-local, initialized/persisted with the existing storage key,
  clamped and applied through setMasterVolume. Every change emits a snapshot so
  attached controls agree. V1 does not use storage events for cross-tab control;
  another tab's stored preference does not change an active tab's session volume.
- LIVE is Channel status independent of receiver ON. Keep existing read polling
  and authoritative track-end re-resolution. Emit program/track/metadata changes
  from existing controller outcomes; no surface navigation-triggered play/seek.
- Subscribe immediately supplies current state. A surface attachment owns its
  unsubscribe handles; HOME revokes the entire attachment on leave even if the
  child fails. Do not retain stale child closures in parent listener sets.
- Host navigation never calls destroy. Actual parent pagehide tears down the
  session, including polling/subscriptions. BFCache pageshow starts OFF; no
  automatic resurrection of a destroyed engine. Do not depend on unload firing
  after process termination; browser lifetime is the final resource boundary.

Exactly one logical session per HOME runtime does not mean one audio element
(the existing dual-deck engine has two), nor an account-wide/cross-tab singleton.
A second tab starts OFF; an explicit ON there is a separate user-controlled
session. Cross-tab arbitration is a separate policy and not silently introduced.

## User gesture and autoplay gate

Safest path retaining current UI: a real click/keyboard activation in the child
calls the registered same-origin parent's `turnOnFromGesture` **synchronously**
in that handler. No await, postMessage, queued command, or network call precedes
parent engine creation/primeForUserGesture. The parent owns all audio objects.
Same-origin activation propagation supports this design, but does not establish
uniform autoplay success across browsers, devices, or delayed media loading.

HOST-00 confirmed trusted synchronous child activation, running AudioContext,
advancing HTMLAudioElement playback, nonzero signal, and stable audio ownership
across child replacements in Chrome 153's existing profile. Six-second delayed
loading after synchronous prime also succeeded. Fresh-profile launch stalled;
Safari/Firefox/iOS and human audible output were not verified. These results
permit an opt-in local skeleton, not production ownership migration. Before
extracting production ownership, complete the remaining browser experiment with
real media and the existing engine: child click → parent prime → deliberately
slow resolver → playback; OFF/ON; frame replacement while playing; track-end
advance on both decks; keyboard/touch; fresh browser profile, Safari/iOS where
available, Chromium, Firefox; no autoplay bypass flags. Record parent/child
activation observations, play promise rejection, AudioContext state, and audible
output. A synthetic click or a mocked engine is not acceptance evidence.

If that direct path fails on a supported browser, stop the migration for a
reviewed parent-owned control placement/gesture design. Do not quietly add an
async-message fallback, auto-retry loop, or claim playback from a resolved
promise alone. A parent-rendered control is the strongest alternative but can
affect layout and is not permission to redesign the HUD in this proposal.

Sources: [HTML activation notification](https://html.spec.whatwg.org/multipage/interaction.html#activation-notification),
[autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay),
[iframe joint history](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe),
[document lifecycle](https://html.spec.whatwg.org/multipage/document-lifecycle.html).

## MEMBER relationship

Do not move MEMBER authority/presentation into HOME in V1. Surfaces continue to
consume the existing shared identity package and Firebase persistence; the
WeakMap singleton is per JavaScript realm/Firebase app, not magically shared
between frames. Parent RADIO repositories do not require a new identity model.
The parent may consume identity later for an independently specified HOME UI.
Existing sign-in/profile/artwork rules and MEMBER dialog remain surface-owned.
Auth persistence, HOME document lifetime, and RADIO session lifetime are three
different concerns. Sign-out does not implicitly turn public RADIO OFF in V1;
any future policy must be explicit. Validate auth restoration and absence of
extra bootstrap writes using emulators, not production accounts.

## Failure and recovery

| Event | Contract |
|---|---|
| Surface load/ready failure | HOME remains alive and RADIO continues; show route-specific error/retry/back controls; host must retain an accessible RADIO OFF action in its error view using the same service |
| RADIO failure during successful navigation | Surface remains usable; session emits truthful reason to controls; no invented fallback track |
| Navigation while OFF | Remains OFF, no engine allocation or automatic ON |
| Channel/manifest resolution failure | Existing all-or-nothing authority behavior; failed receiver state, explicit retry/ON; no local cursor or skipped Program |
| HOME reload / public surface URL reload | New HOME, OFF, saved volume, route restored; next explicit ON rejoins live broadcast. This is recovery, not uninterrupted playback |
| Invalid/private Artwork link | Existing owned-artwork resolver/fallback; reflect resolved identity in URL; no permission bypass or empty persistent placeholder |
| Hidden tab | No navigation/OFF merely because visibility changes; do not promise immunity to browser suspension |
| Browser/OS suspension | If still audibly running, no navigation-style resync. If interrupted, expose state and use existing live resolver for recovery; require gesture if blocked; label any rejoin as recovery, never continuity |
| Full exit or BFCache return | Destroy/return OFF as above; no restored remembered offset or silent autoplay |

## Staged migration and rollback

All stages are separate reviewable commits. No production access/deployment is
implicit. Local/emulator tests must assert emulator opt-in and explicit loopback
endpoints before initializing SDKs; absent/ambiguous configuration aborts, never
falls through to production. Introduce host on an opt-in local entry until all
acceptance stages pass; do not flip public entry routing early.

| Stage | Bounded scope and acceptance | Tests | Rollback boundary | Architecture bookkeeping |
|---|---|---|---|---|
| HOST-00 | Local host/child activation and joint-history experiments; demonstrate synchronous existing-engine playback and one Back step per route, or stop | Real-browser matrix above, slow resolution, frame replacement, error capture | Disposable harness only; no public entry switch | Record evidence/limitations in proposal; no promotion to current truth |
| HOST-01 | Opt-in HOME skeleton, route parser, public/internal entry generation proof, fake inert surface fixtures only; URL table works | Pure route tests, dev/production artifact paths, real Back/Forward/reload/modified clicks | Remove opt-in skeleton; existing entries unchanged | Document experimental host and exact non-production scope |
| HOST-02 | Real MAP adapter, normal chrome/focus, pending-write leave contract; no hosted local receiver | MAP input/resize/member emulator tests; compare normal and legacy PLAY/OBS embeds | Disable MAP host adapter; standalone MAP stays intact | Update SUBWAY host boundary as experimental |
| HOST-03 | BLACKBOOK adapter, artwork replace semantics, leave barrier and deep links | Existing BLACKBOOK tests; emulator save/failure/deep-link cases; drawer/canvas/browser history | Disable BLACKBOOK adapter; no artwork schema rollback | Update BLACKBOOK/navigation facts actually implemented |
| RADIO-01 | Extract explicit RadioSession factory; legacy standalone wrapper uses it with unchanged behavior; opt-in HOME owns service | Lifecycle/race tests, OFF during resolve, failure/retry, destroy, volume, Channel regression tests | Restore wrapper ownership; no public routing switch | RADIO ownership distinguishes standalone and experimental host |
| RADIO-02 | MAP control facade attaches to HOME; hosted bootstrap never constructs local engine | Snapshot/volume/ON/OFF, attachment counts, real child gesture playback | Disable hosted MAP RADIO adapter; keep legacy path | Update MAP/RADIO attachment truth |
| RADIO-03 | BLACKBOOK control facade, identical shared state, no UI redesign | Both-direction ON/OFF/volume, late callbacks/detach, repeated transitions | Disable hosted BLACKBOOK RADIO adapter | Update BLACKBOOK/RADIO attachment truth |
| RADIO-04 | Full browser continuity acceptance; only then enable generated public HOME entries locally/build artifacts | Focused RADIO/MAP/BLACKBOOK/member tests, typecheck/build/launch; real media, reload, history, saves, failure, console, all supported browsers | Revert public entry switch as one boundary; preserve old standalone entries and data | Promote verified host to current registry, record evidence, retain unresolved limits; deployment remains separate |

HOST-01 fixtures are test-only and must not be presented as product surfaces.
HOST-02/03 may show RADIO unavailable in the opt-in harness until RADIO stages;
never ship a partially connected public HOME. Once activated, public rollback
returns to known document-level playback, explicitly losing continuity without
altering packages, Channels, identity, or artwork persistence.

## Final acceptance and unresolved questions

- MAP → BLACKBOOK → MAP → BLACKBOOK → MAP with real RADIO ON: same parent,
  same engine/audio identities, monotonic playback within a track, no
  navigation-triggered pause/load/seek/play; listen for gaps. Natural track
  changes remain existing RADIO behavior. One session, bounded listener counts.
- Repeat OFF; change volume on either view; OFF from either view genuinely stops;
  later ON rejoins current broadcast. No duplicate receivers after retries.
- Direct/reload/artwork/new-tab/Back/Forward cases match the URL table, including
  nested-frame history, interrupted writes and rapid navigation.
- Preserve drawing/PAGES/NEW/CLEAR/DELETE and MAP input/chrome; no console/runtime
  errors, no stale save callback mutating the destination, no auth divergence.
- Unresolved: supported real-device autoplay matrix; iframe joint history across
  browsers; auth popup/persistence in hosted mode; exact pending-write drain seam;
  all relative resource URLs in generated entries; delivery order versus static
  catch-all; suspension detection/recovery evidence. These have named stage gates,
  not assumed solutions. Do not enable public routing until resolved.

Non-goals: new audio engine, Channel/program/package/sync changes, persistent
hidden surfaces, broad SPA conversion, account-wide audio arbitration, MEMBER
migration, drawing redesign, SUBWAY geometry, ADMIN changes, DNS/CORS changes,
production mutation or deployment, and RADIO visual redesign.

## Documentation checkpoint evidence

Implemented in this checkpoint: proposal and verified stale RADIO integration
statements only. Application implementation: none. Initial specification checkpoint ran no browser experiments. HOST-00 later
collected constrained desktop-Chrome evidence, recorded in
[HOST_00_FINDINGS.md](HOST_00_FINDINGS.md); other browser/product gates remain
unverified. Validation: repository path/link checks and
`git diff --check`; no runtime behavior claim. Next separately authorized checkpoint: opt-in local HOST-01, enforcing the
HOST-00 constraints above. Do not enable public routing or migrate production
RADIO until the remaining browser/product gates pass. Never
revert the existing Channel resolver, dual-deck engine, identity, or artwork
infrastructure to implement this proposal.
