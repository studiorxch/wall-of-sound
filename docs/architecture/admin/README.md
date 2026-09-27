# ADMIN — the one-page map

ADMIN is StudioRich's canonical authorized control plane: a sibling of
MEMBER in the global account/navigation layer, not another product
alongside MAP/BLACKBOOK/RADIO.

```
                     MEMBER
                        │
               identity / entitlement
                        │
       ┌────────────────┼────────────────┐
       ↓                ↓                ↓
      MAP           BLACKBOOK          RADIO


ADMIN AUTHORITY
       │
       ↓
     ADMIN
       │
  ┌────┼──────────┬───────────┐
  ↓    ↓          ↓           ↓
RADIO SUBWAY   BLACKBOOK     MUSIC
 ops   editor      ops     intelligence
```

MEMBER and ADMIN both read the same `MemberIdentityState` (one Firebase Auth
identity) — ADMIN is not a second identity system. The distinction is
authority, not a different account: a signed-in operator is still a Member;
ADMIN is additional capability layered on that same identity for accounts on
the `STUDIO_RICH_OPERATOR_EMAILS` allowlist.

## Current (β0.1) scope

Only RADIO is wired into ADMIN. It reuses the existing operator tools
unmodified:

- `music/admin.html` + `music/src/member/adminShellRuntime.ts` — the shell:
  a tab bar (currently one tab, RADIO) over same-origin iframes of
  `event-control.html` (Program) and `channel-control.html` (Channel). Real
  Program/Channel logic is untouched; ADMIN composes, it does not rebuild.
- MAP's own nav (`subwayMemberRuntime.ts`'s `ensureAdminLink()`) shows an
  `ADMIN` link next to the `MEMBER` button, visible only to a signed-in
  authorized operator. It opens `admin.html` in a **new tab** — unlike
  `subwayBlackbookNavLink.js`'s deliberate same-tab link, this is safe
  because `admin.html` never constructs its own `DualDeckPlaybackEngine`;
  MAP's own RADIO receiver keeps running uninterrupted in its own tab while
  an operator works in ADMIN.

## Visibility vs. authorization — the rule this system depends on

**UI visibility is not authorization.** Hiding ADMIN from ordinary members
(no button, no placeholder, no DOM artifact at all — see
`renderAdminLinkVisibility()`, which removes the element rather than
hiding/disabling it) is presentation only. The real authority is
`firestore.rules`' `isEventOperator()`/`isStudioRichOperator()`, checked
independently on every `radioPrograms`/`radioChannels`/`eventProgram` write,
regardless of what any client-side UI shows or hides. A member who manually
navigates to `admin.html` or discovers the URL sees the shell (gated by the
same client-side email check as every other operator-only page in this app)
but cannot perform any operation the rules layer itself doesn't already
allow for their account — confirmed during the β0.1 ADMIN batch: the rules
require `isEventOperator()` for every RADIO write/delete already, with no
gap found.

## Future information architecture (not built yet — direction only)

```
ADMIN
  RADIO      — Programs, Channel Programming, Event Control (β0.1: DONE)
  SUBWAY     — Station Editor, Station Data/Classification, 3D Station Editor
  MUSIC      — Music Intelligence, Analysis/Review, Library Operations
  BLACKBOOK  — Wallpaper, Surfaces, Event/Battle Management
  MEMBERS    — Access, Entitlements, Moderation
  SYSTEM     — Diagnostics, Runtime/deployment status
```

Each future section should follow the same posture RADIO did: compose the
existing canonical implementation into a new ADMIN tab rather than
rebuilding it, and rely on the existing `isEventOperator()`-style rules
enforcement rather than inventing a new authorization mechanism per section.
