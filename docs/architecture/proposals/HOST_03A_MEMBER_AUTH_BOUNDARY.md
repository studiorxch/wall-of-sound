# HOST-03A — Hosted MEMBER authentication boundary (recon)

Status: **IMPLEMENTED as HOST-03B — Model B (the recommended narrow
authentication transport/coordination adapter). Partially human-accepted
(2026-09-30): a real Chrome test reproduced the exact original failure
sequence — `MAP → Google popup sign-in → MAP authenticated → BLACKBOOK →
MAP` — through hosted MAP, and the HOME runtime UUID survived unchanged
throughout. The BLACKBOOK-initiated popup path, the full BLACKBOOK
authenticated-lifecycle acceptance, and the standalone regression checks
remain unverified by a human.** This document's own recon and
recommendation (§7–§9 below) are now current-state truth for the CODE that
exists; see [../home/README.md](../home/README.md)'s own "HOST-03B — hosted
Google-credential transport" section for the implemented contract, files,
and the current, still-partial acceptance table. Baseline:
`release/subway-beta-0.1`, HOST-03 implementation `dfba1b5`, disclosure
commit `529244a`, this recon commit `7ee7d00`, implementation commit
`cff1e12`.

## 1. Starting checkpoint

Clean worktree, `release/subway-beta-0.1`, HEAD `529244a` — confirmed before
any recon activity. Worktree is clean again at the end of this pass (see §15).

## 2. Current auth ownership map

| Context | Entry point | Auth call site | Window that calls `signInWithPopup` |
|---|---|---|---|
| Standalone MAP | `wall/index.html` → `subway-member-runtime.js` (built from `music/src/member/subwayMemberRuntime.ts`) | `memberIdentity.signInWithGoogle()` (also offers email/password in the same dialog) | MAP's own top-level window (never nested) |
| Standalone BLACKBOOK | `music/blackbook.html` → `blackbookRuntime.ts` | `memberIdentity.signInWithGoogle()` (Google only — no email/password UI exists in this dialog) | BLACKBOOK's own top-level window (never nested) |
| HOME-hosted MAP | same `subwayMemberRuntime.ts`, unmodified by HOST-02/03 | same call, unmodified | MAP's window, now nested one level inside HOME's `<iframe id="surface">` |
| HOME-hosted BLACKBOOK | same `blackbookRuntime.ts`, unmodified by HOST-02/03 (HOST-03 only touched navigation/artwork-route sync, never the auth call) | same call, unmodified | BLACKBOOK's window, now nested one level inside HOME's `<iframe id="surface">` |

Every context uses the exact same `@studiorich/member-identity` package
(`createFirebaseMemberIdentityAuthority`), the same `FirebaseAuthGateway`
(`shared/member-identity/src/firebase/firebaseAuthGateway.ts`), and the same
`signInWithPopup(this.auth, this.googleProvider)` call
(`firebase` v12.18.0). **HOST-02 and HOST-03 did not touch MEMBER at all** —
neither surface's own auth call site is hosted-context-aware. HOME itself
(`music/src/home/homeRuntime.ts`) has **no Firebase Auth dependency of any
kind** — this is called out explicitly in the current `home/README.md`:
"No Firebase or media dependency is loaded."

MAP reaches identity through a same-origin bridge
(`window.SBE.MemberIdentityAuthority`, published by `subwayMemberRuntime.ts`,
consumed by `wall/`'s plain-JS files) because `wall/` cannot import an npm
package directly. BLACKBOOK imports `@studiorich/member-identity` directly
(same Vite/TS build as MUSIC). These are **two separate
`MemberIdentityAuthority` instances** — one per surface's own JS realm/bundle
— not a single shared object, even though both ultimately read/write the
same origin-scoped Firebase Auth session (`browserLocalPersistence`). This
was already true before HOST-01 and is unrelated to hosting.

## 3. Exact reproduction procedure (this session)

1. Start Firestore + Auth emulators (`firebase emulators:start --only
   firestore,auth --project studiorich-83b1e`), `tools/host-02/server.mjs`
   (binds `127.0.0.1:5220`, fails closed if emulators aren't reachable), and
   a static server for `wall/` at the `WALL_ORIGIN` the server script expects.
2. Open `http://127.0.0.1:5220/home-dev.html?surface=map` — real MAP loads,
   record the displayed HOME runtime UUID.
3. Click MAP's own `BLACKBOOK` control (not the dev-harness button) — real
   BLACKBOOK mounts; confirm the SAME runtime UUID.
4. Click BLACKBOOK's `SIGN IN` (real `signInWithGoogle()` against the Auth
   emulator's fake-IDP popup).
5. Click BLACKBOOK's own `MAP` control (`#map-nav-link`, intercepted by
   `blackbookHomeSurface.ts` when hosted) and observe the HOME runtime UUID.

Human Chrome result (already reported): step 5 shows real MAP again, but the
HOME runtime UUID is a **new** value — proving `home-dev.html` itself
reloaded, not merely the child iframe.

## 4. Evidence from BLACKBOOK (this session's own follow-up)

- **Differential isolation (decisive)**: repeating steps 1–5 above but
  substituting step 4 with a `javascript_tool`-injected
  `createUserWithEmailAndPassword` call against the SAME Auth emulator, run
  inside the SAME hosted BLACKBOOK document (bypassing the Google popup
  entirely) — the HOME runtime UUID was **provably identical** before and
  after the full MAP → BLACKBOOK → sign-in → BLACKBOOK → MAP sequence. This
  was repeated successfully in this session and rules out
  `syncArtworkRoute`/`openArtwork`/`setActiveArtworkIdentity`/the
  `#map-nav-link` interception (HOST-03's own new code) as the cause — none
  of it differs between the two sign-in paths.
- **Direct observation of `window.open()` anomaly from a nested iframe**:
  this agent's own sandboxed browser-automation tool could not complete a
  real Google popup sign-in at all (confirmed in the prior HOST-03 session
  and reconfirmed this session). Instrumenting `window.open` inside the
  HOME-hosted BLACKBOOK iframe and inspecting the resulting window showed:
  `window.opener` was `null` and the resulting context's own `history.length`
  was `3` (i.e. it was **the same top-level tab**, carrying HOME's own prior
  navigation history) rather than a fresh popup window. In other words, in
  this tool's environment, `window.open()` called from within a nested
  iframe did not produce a genuine separate popup window at all — it
  navigated the top-level tab itself. **This is not claimed to be the same
  mechanism as the human's Chrome failure** (the human's sign-in visibly
  succeeded via a real popup, which this tool could never achieve at all —
  the two environments diverge at an earlier step), but it is direct,
  reproducible evidence that `window.open()`/popup semantics are measurably
  less reliable when the calling document is a nested browsing context
  rather than top-level, which is the one structural fact that changed for
  BLACKBOOK as of HOST-03 (it was never nested before).
- Firebase Auth's own popup relay code (visible in this tool's failure
  stack trace: `sendAuthEventViaIframeRelay`, `saveAuthEvent`,
  `finishWithUser`) searches for a "matching frame" to relay the auth result
  back to — architecture consistent with an implementation that assumes its
  caller is a top-level document, though this was not proven against
  Firebase's actual source in this pass.

## 5. Evidence from MAP

**Not live-tested this session** (would require repeating the same real
Google popup flow through MAP's own dialog, which requires the same popup
completion this tool cannot achieve). Code-level inspection
(`subwayMemberRuntime.ts`) shows MAP's `signInWithGoogle()` call site is
byte-identical in structure to BLACKBOOK's — same package, same gateway, same
`signInWithPopup` call, no hosted-context awareness, called from a window
that is now nested one level inside HOME's iframe exactly like BLACKBOOK's
is. **Reasoned inference, not proof**: MAP very likely has the same latent
exposure. MAP's dialog does additionally offer an email/password path in the
same UI (BLACKBOOK's dialog does not) — a lower-risk fallback already exists
for MAP, but the Google popup button is present and unguarded there too.

## 6. Proven failure mechanism vs. unresolved

**Proven this session**: the failure is caused by the real Google popup sign-in
flow specifically, not by anything HOST-03's own code changed, and not by
"being signed in" generically (email/password sign-in through the identical
hosted document does not reproduce it).

**Not proven**: the exact browser-level mechanism by which a popup opened
from a nested iframe ends up recreating the TOP-level document. Plausible,
unproven candidates, in descending order of how well they fit the evidence:

1. **Cross-Origin-Opener-Policy (COOP) browsing-context-group isolation**:
   Chrome isolates cross-origin popups into a new browsing context group;
   this is a documented source of `window.opener`/`postMessage` relay
   failures for auth popups, and in some Chrome versions has been linked to
   forced reloads/process swaps of the opener's tab. Consistent with this
   session's own observed `window.opener === null` anomaly, though that was
   observed in a different (same-tab-navigation) failure mode, not a
   same-tab-reload failure mode.
2. **A Firebase Auth SDK internal relay/cleanup step** (the "matching frame"
   search this session's own stack trace showed) that assumes its caller is
   a top-level document and, when it is not, ends up acting on `window.top`
   instead of the actual (nested) caller.
3. **Browser back-forward-cache (bfcache) interaction**: opening a popup can
   suspend/evict the opener tab in some browsers; an unusual bfcache
   restore could present as "a fresh top-level load."

No production Firebase, real Google accounts, or non-emulator credentials
were used in this investigation. All testing was emulator-only, per this
checkpoint's own safety requirement.

## 7. Comparison of viable auth models

| Model | Persistent HOME survival | Member-state propagation | User-gesture | Standalone MAP/BLACKBOOK | Emulator compat | RADIO-01 compatibility |
|---|---|---|---|---|---|---|
| **A. Status quo** — child surface invokes the popup directly, unmodified | **Not proven safe** (human-confirmed failure) | Fine when it works (each surface already owns its own state independently; no propagation needed) | Fine (direct click) | Unaffected | Works | **Blocks** — any future persistent RADIO state in HOME is destroyed by the same defect |
| **B. HOME-coordinated popup** — the child's click synchronously calls a new same-origin HOME method (same pattern as the already-proven `turnOnFromGesture` user-gesture propagation in the persistent-host proposal); HOME's own (never-nested) window calls `signInWithPopup`, returns the resulting credential to the child, which signs its OWN local `MemberIdentityAuthority` in via `signInWithCredential` | Targets the suspected root cause directly — HOME's window is never itself embedded, so this is the same class of call that already works reliably in standalone MAP/BLACKBOOK today | Each surface keeps its own state machine/subscription unchanged; only the popup CALL relocates — an "authentication transport/coordination adapter," not a MEMBER redesign | Preserved IF the child's click handler calls the HOME method synchronously (same proven pattern as RadioSession's user-gesture requirement) | Unaffected — standalone surfaces keep calling `signInWithPopup` directly, exactly as today; the delegation is conditional on `isHome`, same pattern as navigation | Requires HOME to gain its OWN Firebase Auth app instance for the first time (see §9) — a real, but narrow, new dependency | **Matches** the exact parent-owned-lifecycle/child-consumes-state pattern the persistent-host proposal already established for RadioSession |
| **C. HOME-coordinated redirect** (`signInWithRedirect`) | If HOME itself redirects: destroys HOME's own document by design (worse than the defect it would fix). If the child redirects while nested: identity providers commonly refuse to render inside a cross-origin iframe (clickjacking protection) — likely just relocates the failure, unverified without further browser testing | N/A pending the above | Not gesture-sensitive the same way, but the return trip needs coordinated completion-state handling not yet designed | Would need every surface's redirect-completion handling to branch on hosted vs. standalone | Emulator supports redirect flows, untested here | Same problem as Model A if done at HOME level (destroys the persistent document by design) |
| **D. Full MEMBER centralization in HOME** (HOME owns one shared `MemberIdentityAuthority`, children only render UI and consume state) | Same survival benefit as B | Real MEMBER ownership change — both surfaces would need to stop constructing their own `MemberIdentityAuthority` and consume HOME's instead | Same as B | Requires a parallel non-HOME code path preserved indefinitely (added long-term maintenance surface) | Same as B, plus larger blast radius | Also matches the RadioSession pattern, but goes further than the evidence requires |

## 8. Recommended ownership boundary

**Model B — an authentication transport/coordination adapter only.** The
evidence supports relocating just the risky operation (initiating and
completing the Google popup) to HOME, the one window that is guaranteed
never itself nested. It does **not** support centralizing all of MEMBER
(Model D) — each surface's own `MemberIdentityAuthority` instance, state
machine, and Firestore `members/{uid}` bootstrap logic are untouched and
already correct; only the popup's *initiating window* is architecturally
wrong once that window can be nested. This directly answers recon question 7:
**an authentication transport/coordination adapter only** — not "no change,"
and not "broader MEMBER architecture change."

## 9. Smallest proposed implementation checkpoint (NOT implemented this pass)

1. Give HOME (`music/src/home/homeRuntime.ts`) its own `createFirebaseAuthGateway`-backed
   Google popup helper, gated the same way HOST-02/03 gated navigation: a
   new `HomeSurfaceHost` method, e.g. `requestGoogleCredential(source,
   identity): Promise<SerializedGoogleCredential | null>`, validated by the
   same `activeCaller()` gate already used for `requestNavigate`/
   `syncArtworkRoute`.
2. In each surface, when `isHome` is true, the sign-in button's click handler
   calls the new HOME method **synchronously within the click handler**
   (preserving the user gesture) instead of calling `signInWithPopup`
   locally; on a successful credential, call the surface's own
   `signInWithCredential(auth, credential)` to complete sign-in through its
   own existing, unmodified `MemberIdentityAuthority`. When `isHome` is
   false (standalone), keep calling `signInWithPopup` directly exactly as
   today — no change to standalone behavior.
3. HOME needs an actual Firebase Auth app instance for the first time —
   configured the same emulator-only way `tools/host-02/server.mjs` already
   configures the child surfaces, with the same fail-closed emulator-absence
   behavior. This is the one genuinely new dependency this model requires.
4. Re-run the exact reproduction procedure in §3, this time through the real
   Google popup, initiated from HOME's own (never-nested) window, and
   confirm the HOME runtime UUID survives.

This is explicitly **not** implemented in this checkpoint — it is a
recommendation for a future, separately-scoped HOST-03A implementation
batch.

## 10. Files/subsystems a future implementation would affect

- `music/src/home/homeSurfaceContract.ts` / `homeRuntime.ts` (new HOME-side
  Auth gateway + API method)
- `music/src/home/blackbookHomeSurface.ts` (new method to request/relay a
  credential)
- `music/src/member/blackbookRuntime.ts` (sign-in button branches on
  `isHome`)
- A new, analogous MAP-side adapter (`wall/systems/presentation/`, likely
  paralleling `homeMapSurface.js`) plus `subwayMemberRuntime.ts`'s own
  sign-in branching
- `tools/host-02/server.mjs` (or its successor) — HOME's own emulator env
  wiring
- `shared/member-identity` is very likely **untouched** — `signInWithCredential`
  already exists in the `firebase/auth` package this repo depends on; no
  interface change to `MemberIdentityAuthority`/`AuthGateway` is obviously
  required, though this should be confirmed during implementation, not
  assumed.

## 11. Standalone compatibility requirements

Standalone MAP and standalone BLACKBOOK must keep calling `signInWithPopup`
directly, completely unaffected by HOME's existence — the same `isHome`
conditional pattern HOST-02/03 already established for navigation, applied
here to auth initiation instead.

## 12. Acceptance matrix for the future implementation

- HOME-hosted BLACKBOOK: real Google popup sign-in succeeds AND the HOME
  runtime UUID is unchanged before/after, through at least one full
  MAP → BLACKBOOK → sign-in → BLACKBOOK → MAP round trip.
- HOME-hosted MAP: same acceptance, via MAP's own Google sign-in control.
- Standalone MAP and standalone BLACKBOOK: real Google popup sign-in
  continues to work exactly as before, unmodified.
- Sign-out, from both hosted and standalone contexts, unaffected.
- A repeated sign-in/sign-out cycle while hosted does not leak listeners,
  duplicate credentials, or leave HOME in a stale-active state.
- Emulator-absence still fails closed for any new test coverage — never
  falls through to production.
- Reload/direct-entry/Back-Forward behavior for BOTH surfaces, hosted and
  standalone, unaffected by this change (auth is orthogonal to route
  history).

## 13. RADIO-01 readiness decision

**Not ready.** RADIO-01 depends on HOME's own top-level document reliably
surviving ordinary member interactions with a hosted child surface — exactly
the property this recon found broken for real Google popup sign-in. RADIO-01
should not begin until a HOST-03A implementation checkpoint (§9) closes this
gap and its acceptance matrix (§12) passes.

## 14. Architecture documentation changes made this pass

- This document (new): `docs/architecture/proposals/HOST_03A_MEMBER_AUTH_BOUNDARY.md`.
- `docs/architecture/README.md`: added a pointer to this proposal.
- `docs/architecture/DEBT.md`: updated the existing HOST-03 auth-popup entry's
  revisit trigger to point at this recon document and its recommended model,
  without claiming the defect is fixed.
- `docs/architecture/home/README.md`: not modified this pass — its existing
  HOST-03 human-acceptance section already accurately describes the defect;
  this recon document is the deeper analysis, linked from there is
  unnecessary since DEBT.md already carries the pointer members/blackbook use.

## 15. Final git status

Clean worktree after the recon+documentation commit; no application code was
changed in this checkpoint.
