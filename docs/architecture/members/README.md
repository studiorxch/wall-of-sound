# MEMBERS Architecture Map

Read this before any task touching identity, sign-in, or operator authority.
See [../README.md](../README.md) for what this directory is.

## 1. Product/runtime role

MEMBERS is StudioRich's shared identity/authentication infrastructure — the
one Firebase Auth-backed identity every StudioRich surface (MUSIC, RADIO
operator pages, MAP/SUBWAY authoring, BLACKBOOK) authenticates against.
There is no second identity system anywhere in this codebase.

## 2. Current canonical implementation

Package: `shared/member-identity` (a separate npm package, consumed via a
`file:` dependency — its `dist/` must be rebuilt with
`npx tsc -p tsconfig.build.json` after any source change there before `music`
picks it up; `dist/` is gitignored).

```
Firebase Auth (Google sign-in + email/password)
  → firebaseAuthGateway.ts        wraps signInWithPopup/signInWithEmailAndPassword,
                                   browserLocalPersistence
  → memberIdentityAuthority.ts    the state machine: initializing → signedOut
                                   | signedIn (authUser + member) | error
  → memberBootstrap.ts            pure create-vs-update-patch decision for the
                                   members/{uid} Firestore document on sign-in
  → createFirebaseMemberIdentityAuthority.ts
                                   the WeakMap-per-Firebase-app singleton
                                   factory every consumer actually calls
```

`createFirebaseMemberIdentityAuthority(env)` is the one entry point every
consumer uses to get a `MemberIdentityAuthority` (`.getState()`,
`.subscribe()`, `.signInWithGoogle()`, `.signInWithEmailPassword()`,
`.signInWithCredential()`, `.signOut()`, `.start()`).

**HOST-03B (development-only HOME hosting, see [../home/README.md](../home/README.md)):**
`signInWithCredential(serialized)` completes sign-in from a credential
obtained elsewhere — specifically, HOME's own never-nested window running a
SEPARATE, minimal `createFirebaseGoogleAuthPopupInitiator` (also exported
from this package) that ONLY calls `signInWithPopup`/extracts
`credential.toJSON()`. This is not a second identity system and not MEMBER
ownership migration: the popup initiator never constructs a
`MemberIdentityAuthority`, never touches `members/{uid}`, and every
consumer's own state machine (this file's whole point) is unchanged. A
hosted surface delegates ONLY the popup call itself when it detects hosting
(BLACKBOOK/MAP's own existing, explicit `isHome` detection — never bare
`window.self !== window.top`); standalone continues calling
`signInWithGoogle()` directly, exactly as before HOST-03B.

## 3. Major components

| Component | File | Role |
|---|---|---|
| Auth gateway | `firebase/firebaseAuthGateway.ts` | Firebase Auth wrapper, `browserLocalPersistence`; `signInWithCredential` reconstructs via `OAuthProvider.credentialFromJSON` |
| Hosted popup initiator (HOST-03B) | `firebase/firebaseGoogleAuthPopupInitiator.ts` | `createFirebaseGoogleAuthPopupInitiator` — HOME's own minimal `signInWithPopup` + `credential.toJSON()`; not a `MemberIdentityAuthority`, no Firestore access |
| Identity authority | `logic/memberIdentityAuthority.ts` | the state machine consumers subscribe to |
| Bootstrap logic | `logic/memberBootstrap.ts` | pure — decides create vs. update-patch for `members/{uid}` on sign-in |
| Member repository | `logic/memberRepository.ts` / `firebase/firestoreMemberRepository.ts` | reads/writes `members/{uid}` |
| Canonical types | `data/memberTypes.ts` | `StudioRichMember`, `CanonicalAuthUser`, `MemberIdentityState` (the type every consumer actually branches on) |
| Public projection | `data/publicMember.ts` | `serializePublicMember()` — strips Auth-owned email/account fields for anything that displays another member's identity publicly (used by BLACKBOOK/MAP artwork attribution) |
| Operator identity | `data/operatorIdentity.ts` | `STUDIO_RICH_OPERATOR_EMAILS` — the one canonical client-side operator allowlist (see §6) |

## 4. Data / persistence authority

```
Firebase Auth              the actual sign-in/session authority
                            (browserLocalPersistence — ORIGIN-SCOPED: a
                            session on one running dev server/port does not
                            carry over to a different one, even for
                            identical code)

Firestore members/{uid}    canonical profile (displayName, photoURL,
                            accountStatus, onboardingVersion, timestamps)
                            — created/patched by memberBootstrap.ts's plan,
                            never hand-authored

Firestore artworks         member-authored content, gated by
                            resource.data.creatorId == request.auth.uid
                            (ordinary members) or the operator allowlist for
                            surfaceId: map:* (see §6)
```

MEMBERS does not own or touch MUSIC's own local IndexedDB authoring state
(`MUSIC_STATE_DB`, `MUSIC_STATION_GEOMETRY_DB`) — that remains
application-specific to MUSIC, not shared identity state.

## 5. Ownership boundaries

**MEMBERS owns identity/authentication and shared member authority.**
Domain subsystems (RADIO, MAP/SUBWAY, BLACKBOOK) may own their own
domain-specific access policy attached to their own content — e.g. RADIO's
Program/Channel write-gating, or MAP's `map:*` surface restriction — while
relying on MEMBERS only for *who the signed-in identity is* and *whether
they're the one StudioRich operator*. MEMBERS itself has no concept of
RADIO Programs, Channels, or SUBWAY surfaces.

## 6. Operator/admin authority

One boolean capability exists today — StudioRich-operator-or-not — no finer
entitlements/permissions system exists (no per-feature grants, no roles
beyond "operator" vs. "ordinary signed-in member" vs. "anonymous").

```
STUDIO_RICH_OPERATOR_EMAILS          data/operatorIdentity.ts — the ONE
                                      canonical client-side allowlist,
                                      imported by every operator-gated UI
                                      (eventControlRuntime.ts,
                                      channelControlRuntime.ts,
                                      RadioPlaylistPublishPanel.tsx, and
                                      Wall's subwayMapPaintSurface.js via
                                      the window.SBE bridge — see §7)

firestore.rules' studioRichOperatorEmails()
                                      the REAL server-side authority —
                                      isStudioRichOperator() /
                                      isEventOperator() (alias) /
                                      isStudioRichMapAuthor() (alias) all
                                      resolve to this one function
```

The client-side list is a UX gate only (hides/shows controls quickly); the
Firestore-rules copy is what actually enforces anything. **These two copies
must be kept in sync by hand** — there is no mechanism to share a literal
between TypeScript and the Firestore rules language.

## 7. Integration boundaries

- **MUSIC / RADIO operator surfaces** — `event-control.html`,
  `channel-control.html`, and `RadioPlaylistPublishPanel.tsx` all import
  `@studiorich/member-identity` directly (real Vite/TS modules, part of
  MUSIC's own build).
- **BLACKBOOK** — `blackbookRuntime.ts`/`blackbookArtworkBridge.ts` also
  import it directly, same reason (part of MUSIC's Vite build,
  `blackbook.html`'s own entry).
- **WALL/SUBWAY** (`wall/`) — a separate, non-Vite, plain-JavaScript
  runtime that **cannot** import an npm package directly. It reaches member
  identity only through a bridge:
  `music/src/member/subwayMemberRuntime.ts` (a real Vite/TS module, built as
  its own standalone bundle entry, `subway-member-runtime.js`) constructs
  the real `MemberIdentityAuthority` and publishes state onto
  `window.SBE.MemberIdentityAuthority` / `window.SBE.MemberIdentityState`.
  `wall/systems/presentation/subwayMapPaintSurface.js` and other `wall/`
  files read `window.SBE.MemberIdentityState` — never construct their own
  identity object, never a second Firebase Auth instance.

## 8. Canonical / active / legacy status

Everything in this package is **CANONICAL** — no legacy or superseded
identity mechanism was found in bounded recon (checked for a second/older
auth path; none exists). This is the one identity system.

## 9. Known architectural debt

The operator-email dual-copy sync burden in §6 above is a design
characteristic, not filed as debt, since no better mechanism is currently
available in the Firestore rules language. See [../DEBT.md](../DEBT.md) for
the one real open item: HOST-03B's hosted Google-credential transport has
not yet been proven against a real Google popup in a real browser (only unit
tested — this agent's own sandboxed browser-automation tool cannot open a
genuine popup window at all, hosted or standalone).

## 10. Unresolved questions

None — bounded recon for this pass answered every item on the required
list directly from current code.
