# Persistent MEMBER presentation boundary (recon)

Status: **RECON ONLY — no code implemented, nothing decided.** This is a
proposal/analysis document, not current-state truth (see `../README.md`'s
own rule on this directory). It answers a product/architecture question
HOST-03B's own human acceptance surfaced; it does not implement an answer.
Baseline: `release/subway-beta-0.1`, HOST-03B implementation `cff1e12`,
partial-acceptance documentation `a843ca7`.

## Why this exists

HOST-03B's human acceptance proved the hosted-MAP Google-popup transaction
preserves persistent HOME (`../home/README.md`'s own acceptance table). But
the human separately observed that BLACKBOOK has no control comparable to
MAP's persistent, recognizable MEMBER presence — and does not consider
BLACKBOOK's small, context-dependent SIGN IN/SIGN OUT utility button
equivalent. **This is not evidence HOST-03B's credential transport is
broken** — it is a genuinely separate, previously unasked question: should
persistent HOME also own the shared *presentation* of member identity across
whichever surface it currently hosts, the way persistent RADIO is expected
to eventually live above individual surfaces too?

## Four distinct concerns — keep these separate

| Concern | Current owner | Status |
|---|---|---|
| **Identity authority** — Firebase Auth session, `MemberIdentityAuthority` state machine, Firestore `members/{uid}` bootstrap | Each surface's own instance (MAP's and BLACKBOOK's `MemberIdentityAuthority` are separate objects reading the same origin-scoped Firebase Auth session) | Unchanged by HOST-03B; not in question here either |
| **OAuth transaction ownership** — who physically opens/completes the Google popup | HOME, for hosted surfaces (HOST-03B) | Implemented, partially human-accepted (hosted MAP proven; hosted BLACKBOOK path still pending) |
| **Persistent MEMBER presentation** — a recognizable, always-visible member/avatar control regardless of which surface is active | **Nobody today.** HOME renders no member-related UI at all | **Not implemented — this document's own question** |
| **Surface-specific MEMBER presentation** — each surface's own sign-in control/dialog/profile panel | MAP: fixed `position:fixed;top:104px;right:16px` pill (`subwayMemberRuntime.ts`'s `ensureTopLevelSignInUI`), reading SIGN IN / MEMBER, opening either the sign-in dialog or a full `memberHomeUI.ts` "Member Home" panel (profile, artwork gallery, sign-out) when clicked. BLACKBOOK: one bottom-bar pill (`#blackbook-member`), reading SIGN IN / SIGN OUT, no dialog, no Member Home equivalent, and its own screen position is CSS-breakpoint-dependent (bottom-left corner at ≥900px wide, centered below 900px) | Exists today, must keep working standalone regardless of any HOME-level addition |

## 1. Reconciling current docs with this finding

`../home/README.md`'s HOST-03B section only ever claimed the OAuth
*transaction* moved to HOME — it never claimed presentation parity, so
there is no factual error to correct there. The gap is an omission, not a
mistake: nothing in the canonical docs yet names "persistent MEMBER
presentation" as its own, currently-unowned axis. This document exists to
name it.

## 2. Surface-owned MEMBER UI today

- **MAP**: persistent, fixed-position, always-visible pill (same visual
  treatment as the BLACKBOOK-nav-link/RADIO HUD chrome it's stacked with).
  Signed out → "SIGN IN" (opens a modal dialog with email/password + Google).
  Signed in → "MEMBER" (opens `memberHomeUI.ts`'s own panel: recent artwork,
  profile, new-artwork creation, sign-out).
- **BLACKBOOK**: one small pill in the bottom toolbar, no dialog, no panel —
  directly toggles SIGN IN ⇄ SIGN OUT. Position shifts between a screen
  corner and center depending on the document's own rendered width.

## 3. Is a persistent HOME-level avatar compatible with MEMBER-above-HOME?

**Yes, without centralizing identity authority.** The same "the surface
reports a small state snapshot up; HOME never becomes a second authority"
pattern HOST-03B already established for the credential handoff (and
HOST-03's `syncArtworkRoute` established for Artwork identity) applies
directly here:

- HOME would gain a presentation-only avatar/pill in its own persistent
  chrome.
- The currently-mounted surface reports a lightweight, serializable
  snapshot (e.g. `{signedIn: boolean, displayName, photoURL}` — never the
  full `MemberIdentityAuthority`, never a Firebase `User` object) up to
  HOME whenever its own member state changes — a new, narrow
  `HomeSurfaceHost` method, symmetric to `requestGoogleCredential` and
  `syncArtworkRoute`.
- HOME renders from that snapshot only. It does not subscribe to Firebase
  Auth itself, does not own a `MemberIdentityAuthority`, and does not
  persist anything beyond what's already visible in the currently-mounted
  surface's own state.
- Clicking HOME's avatar would need to delegate back into the mounted
  surface (open ITS OWN sign-in dialog or Member Home panel) — another
  synchronous, same-origin request, the same shape as the existing
  `requestGoogleCredential`/`requestNavigate` calls — or, to shrink the
  first checkpoint further, a v1 avatar could be **read-only presentation
  only** (shows who's signed in, no click-to-open interaction yet),
  deferring the delegated-open behavior to a later pass.

This is compatible with "MEMBER remains conceptually above HOME" precisely
because HOME's role stays that of a *reporter/renderer*, not an *owner* —
the same distinction already drawn for RADIO's own planned `RadioSession`
(HOME hosts the session object and its `subscribe()`/`getSnapshot()`
surface, but doesn't reimplement Channel/Program resolution itself).

## 4. What could eventually be removed/delegated

If HOME renders one persistent avatar, each hosted surface's OWN
fixed-position pill (MAP's top-right pill; BLACKBOOK's bottom pill) becomes
redundant *while hosted* and could be hidden/removed from that surface's own
chrome in that context — mirroring how MAP's `wos-embed`/PLAY-bridge
behaviors already get suppressed specifically `when hosted` (`isHome`),
never globally. The underlying dialog/Member Home panel components
themselves would likely still live in the surface (least invasive — no need
to move `memberHomeUI.ts` or the sign-in dialog markup into HOME), just
triggered by HOME's avatar via a delegated open-request instead of the
surface's own now-hidden button.

## 5. Standalone MAP/BLACKBOOK must keep working when HOME is absent

Unconditionally true and unaffected by anything above: standalone MAP keeps
its own fixed pill + Member Home panel; standalone BLACKBOOK keeps its own
bottom pill. Any HOME-level avatar is a hosted-only addition, gated by the
same `isHome` detection HOST-02/03/03B already established — never a
replacement for the surface-owned controls, which remain the only MEMBER
access point whenever HOME isn't present (direct-entry URLs, `/blackbook.html`
or `/wall-app/` visited directly).

## 6. Sequencing relative to RADIO-01

These are independent axes with no hard technical dependency in either
direction:

- **RADIO-01's own readiness gate** (per `../home/README.md`'s HOST-03B
  acceptance table and `../DEBT.md`'s revisit trigger) is specifically
  "does ordinary hosted navigation + Google authentication preserve the HOME
  runtime, for BOTH hosted surfaces." That gate does not require persistent
  MEMBER presentation to exist — RADIO-01 can proceed once the outstanding
  BLACKBOOK-path human acceptance items close, independent of this document.
- **This document's own question** is a product-completeness/UX question,
  not a navigation-survival one — persistent MEMBER presentation is not
  required for HOME to be technically safe to build RADIO-01 on top of.

**Recommendation (not a requirement):** it is reasonable to do a unified
"persistent HOME chrome" design pass (RADIO controls + MEMBER avatar
together) once RADIO-01's own functional migration lands, rather than
redesigning HOME's chrome twice. But this is a scheduling/product judgment
call, not a technical blocker either way, and should not delay RADIO-01
itself.

## Current ownership diagram

```
Firebase Auth (shared, origin-scoped session)
   │
   ├── MAP's own MemberIdentityAuthority (subwayMemberRuntime.ts)
   │     └── MAP's own persistent chrome: fixed top-right pill
   │            SIGN IN → dialog (email/password + Google)
   │            MEMBER  → memberHomeUI.ts panel (profile, artwork, sign-out)
   │
   └── BLACKBOOK's own MemberIdentityAuthority (blackbookRuntime.ts)
         └── BLACKBOOK's own bottom-bar pill (#blackbook-member)
                SIGN IN → hosted transport or direct Google popup
                SIGN OUT → direct sign out
                (no Member Home equivalent; position is breakpoint-dependent)

persistent HOME (HOST-02/03/03B)
   └── owns ONLY: navigation/history authority, Artwork-route sync, and the
       hosted Google popup TRANSACTION -- no presentation, no persistent
       avatar, no knowledge of member state at all today.
```

## Proposed conceptual direction (evaluate only — not implemented)

```
MEMBER / identity (Firebase Auth; still one MemberIdentityAuthority PER surface)
       │
       ▼
persistent HOME
 ├── persistent MEMBER/avatar presentation (NEW, if adopted)
 │     - a new HomeSurfaceHost method lets the mounted surface report a
 │       small, serializable snapshot (signedIn/displayName/photoURL) --
 │       never the MemberIdentityAuthority itself
 │     - HOME renders ONE consistent avatar from that snapshot
 │     - v1 can be read-only presentation; click-to-open delegation
 │       (opening the surface's own dialog/Member Home panel) is a
 │       reasonable v2, not required to ship v1
 ├── persistent RADIO (separate, already-planned axis, own migration path)
 └── current surface (MAP | BLACKBOOK | future)
       - still owns MemberIdentityAuthority, sign-in dialog/state machine,
         Firestore member bootstrap, artwork/profile data -- UNCHANGED
       - standalone (no HOME) keeps its OWN existing presentation exactly
         as today -- never removed, always the fallback
```

## Smallest checkpoint, if this direction is adopted

1. New `HomeSurfaceHost` method (e.g. `reportMemberPresence(source,
   identity, snapshot)`), gated by the same `activeCaller()` pattern
   `syncArtworkRoute`/`requestGoogleCredential` already use.
2. Each hosted surface calls it whenever its own `MemberIdentityAuthority`
   state changes (signed in/out) — symmetric to how `setActiveArtworkIdentity`
   already reports Artwork changes.
3. HOME renders one small, persistent avatar/pill from the latest reported
   snapshot — presentation only, v1 read-only (no click-to-open yet).
4. Explicitly out of scope for this checkpoint: `MemberIdentityAuthority`
   centralization, Member Home panel redesign, removing any surface's own
   existing controls (standalone must be untouched; hosted surfaces MAY
   later hide their own redundant pill once HOME's avatar is proven, but
   that's a follow-up, not part of the first checkpoint).

## Answers to the direct questions

- **Can HOST-03B still close independently?** Yes. HOST-03B never promised
  presentation parity — its own scope was the OAuth transaction only, and
  that remains independently valid. Its one remaining open item is still
  just the BLACKBOOK-path human acceptance (Google popup from hosted
  BLACKBOOK while signed out; BLACKBOOK → MAP → BLACKBOOK after that;
  BLACKBOOK's authenticated lifecycle; both standalone regression checks —
  see `../DEBT.md`'s current entry). This presentation question is a
  separate, newly-opened item, not a blocker on HOST-03B's own closure.
- **Should RADIO-01 remain next, or be preceded by a MEMBER presentation
  checkpoint?** RADIO-01 should remain next once HOST-03B's own remaining
  acceptance items close. A MEMBER presentation checkpoint is not a
  prerequisite for RADIO-01's own technical readiness gate; sequencing it
  before, after, or alongside RADIO-01 is a product decision, not an
  architectural requirement.

## Architecture documentation implications

This document is new (`proposals/MEMBER_PRESENTATION_BOUNDARY.md`), listed
from `../README.md`'s proposals index. No current-state truth document
(`../home/README.md`, `../members/README.md`) required correction — both
already accurately scope HOST-03B as transaction-only, never claiming
presentation parity. Nothing here is promoted to current-state truth until
an actual implementation checkpoint lands.
