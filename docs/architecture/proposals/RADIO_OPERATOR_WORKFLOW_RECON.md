# RADIO β0.1 — operator playlist/programming recon

Status: **RECON ONLY — no code implemented.** This is a proposal/analysis
document, not current-state truth (see `../README.md`'s own rule on this
directory). It answers "what exists today and where does the operator
workflow stop" for RADIO β0.1; it does not implement the missing pieces.
Baseline: `release/subway-beta-0.1`, RADIO-01 implementation `24cd4dd`,
human audible acceptance commit `1fdb4c9`.

**Headline finding, ahead of the detail below: far more already exists,
through real UI, than the brief's own framing assumed.** MUSIC already has
a full multi-playlist authoring surface with a per-playlist "Send → RADIO"
action; a real Publish panel with a five-category readiness preview,
storage estimates, and a "Create Program" button; and `channel-control.html`
already has a complete rotation editor (add/remove/reorder Programs via a
real `<select>` populated from `listRadioPrograms()`, Save Rotation,
Activate/Deactivate, Start/Restart Rotation Now) — not a stub. The real gap
is narrower than "build an operator workflow from scratch": it is (1) one
missing terminal-only step between local export and public hosting, and (2)
`RadioProgram` having no update/delete at all (create-only, forever).

## 1. Current end-to-end RADIO operator workflow diagram

```
MUSIC (music/src/App.tsx, local browser IndexedDB "MUSIC_STATE_DB")
  PlaylistsGrid.tsx -- create / open / duplicate / delete
  (no rename found; title is set at creation only)
  PlaylistProject { projectId, title, tracks, slots, ... } -- ALREADY
  multi-playlist by design, not a single-playlist model with a UI bolted on
        │ "Send → RADIO" (per-playlist button, already in the grid AND
        │  the playlist header) -- LOCAL ONLY, no Firestore write yet
        ▼
RadioPlaylist (music/src/data/radioPlaylistTypes.ts)
  sourceMusicPlaylistId links back to the MUSIC PlaylistProject
  lives in MUSIC's own local state (radioPlaylistsRef/setRadioPlaylists),
  NOT Firestore -- this is a local "inbox/staging" representation, not yet
  the immutable Package
        │ RadioPlaylistPublishPanel.tsx -- "Publish" (real UI, five-
        │ category preview: Ready/Needs approval/Needs preparation/
        │ Stale-or-failed/Excluded; storage estimate; runOnePublishViaFetch)
        │ WRITES to library/music/RadioWebExports/<slug>/v<n>/ via MUSIC's
        │ own local Vite dev-server (POST endpoints in vite.config.ts) --
        │ requires MUSIC's dev server to be running; not a terminal script
        ▼
immutable RadioWebExportRecord + real files on disk
  (radio-manifest.json, audio/*.opus, artwork/, checksums.json)
  addressed locally at /radio-web-export/<slug>/v<n>/ (dev preview only,
  never production-reachable -- see "Public package addressing" in
  ../radio/README.md)
        │ *** TERMINAL-ONLY STEP, NO UI *** --
        │ node scripts/publish-radio-to-sites.mjs <slug>
        │ (music/scripts/publish-radio-to-sites.mjs) copies the
        │ byte-verified export into studiorich-orbital's public/radio/
        │ and flips the active-station pointer
        ▼
public package at https://radio.studiorich.tv/radio/<slug>/v<n>/
  (actual deployment of studiorich-orbital itself to the live domain is a
  further, separate concern -- out of this recon's scope, see
  ../DEPLOYMENT.md)
        │ RadioPlaylistPublishPanel.tsx's own "Create Program" button
        │ (real UI) -- builds manifestBaseUrl via
        │ buildRadioPublicPackageBaseUrl(slug, bundleVersion) (the PUBLIC
        │ URL, never the local preview route) and calls
        │ createRadioProgram(...) -- ALSO reachable from event-control.html
        │ directly (createRadioProgram appears there too)
        ▼
radioPrograms/{programId} (Firestore, real operator-authorized write)
  CREATE-ONLY -- EventRadioRepository has no update/delete method for a
  Program AT ALL, in the UI or the repository interface itself
        │ channel-control.html's rotation editor (real UI) --
        │ a <select> populated from listRadioPrograms() (no manual ID
        │ copying), addProgramToRotation / moveProgramUp / moveProgramDown
        │ / removeProgramFromRotation, Save Rotation, Activate/Deactivate,
        │ Start/Restart Rotation Now (resets anchorAtMs to Date.now())
        ▼
radioChannels/studiorich-radio (Firestore, real operator-authorized write)
  { status, rotation: { anchorAtMs, programIds[] } }
        │ resolveChannelRotation / resolveChannelTrackBroadcast (pure,
        │ deterministic functions of (state, nowMs) -- see ../radio/README.md)
        ▼
Broadcast State  →  RADIO / MAP / BLACKBOOK receivers (RADIO-01: persistent
                     shell-owned when hosted, unchanged standalone)
```

## 2. Exact canonical files/modules/types at each stage

| Stage | Files |
|---|---|
| MUSIC Playlist | `music/src/data/playlistTypes.ts` (`PlaylistProject`), `music/src/ui/PlaylistsGrid.tsx`, `PlaylistHeader.tsx`, `NewPlaylistDialog.tsx`/`NewPlaylistWizard.tsx`, `music/src/logic/musicStateStore.ts` (IndexedDB `MUSIC_STATE_DB`) |
| MUSIC → RadioPlaylist | `music/src/App.tsx` (`handleSendPlaylistToRadio`/`handleSendPlaylistToRadioClick`), `music/src/data/radioPlaylistTypes.ts`, `music/src/logic/radio/*` sync/compare helpers (`compareMusicPlaylistToRadioPlaylist`, etc.) |
| RadioPlaylist → export | `music/src/ui/radio/RadioPlaylistPublishPanel.tsx`, `music/src/logic/radio/radioPublishPreview.ts`, `radioOnePublishOrchestrator.ts`, `radioStorageEstimate.ts`, `radioPlaylistPublicationState.ts`; write-side POST endpoints in `music/vite.config.ts` |
| Export → public hosting | `music/scripts/publish-radio-to-sites.mjs` (terminal-only), `studiorich-orbital/` (separate project), `../DEPLOYMENT.md` |
| Package → Program | `RadioPlaylistPublishPanel.tsx`'s `handleCreateProgram`, `music/src/member/eventControlRuntime.ts`, `shared/member-identity/src/data/eventRadioTypes.ts` (`EventRadioRepository`, create-only), `shared/member-identity/src/firebase/firestoreEventRadioRepository.ts`, `music/src/logic/radio/programFromManifest.ts` (a SEPARATE, unused-by-the-above bootstrap-from-manifest path, HTTPS-only by its own client-side convention) |
| Program → Channel rotation | `music/src/member/channelControlRuntime.ts`, `music/src/logic/radio/channelRotationEditorState.ts`, `shared/member-identity/src/data/radioChannelTypes.ts` (`RadioChannelRepository`, create+update, no delete), `shared/member-identity/src/firebase/firestoreRadioChannelRepository.ts` |
| Channel → Broadcast | `music/src/logic/radio/channelRotation.ts`, `channelRotationHydration.ts`, `currentChannelBroadcast.ts`, `channelTrackPosition.ts`, `channelTrackBroadcast.ts`, `music/src/logic/radio/channelListenerPlayback.ts`, `music/src/audio/DualDeckPlaybackEngine.ts` |
| ADMIN composition | `music/admin.html` + `music/src/member/adminShellRuntime.ts` (iframes `event-control.html` + `channel-control.html`, unmodified) |
| Separate, parallel system | `shared/member-identity/src/data/eventRadioTypes.ts`'s `EventProgramState`/`setEventProgram`/`getEventProgram` — `eventProgram/current`, a SINGLETON document, `playbackMode: "personal"|"clock"`, `status: "inactive"|"ready"|"active"`, `endPolicy: "stop"|"repeat"` — explicitly NOT Channel authority (see "What is NOT Channel authority" in `../radio/README.md`) |

## 3. What works through UI today

- Create/open/duplicate/delete MUSIC playlists (no rename found).
- Send any playlist to RADIO (creates/updates a local `RadioPlaylist`).
- A real five-category publish-readiness preview, storage estimate, and
  "Publish" action that writes real audio + manifest files to
  `library/music/RadioWebExports/`.
- "Create Program" from a just-published export, pointed at the intended
  PUBLIC package URL.
- Full Channel rotation management: pick any existing Program from a real
  dropdown, add/remove/reorder, Save Rotation, Activate/Deactivate,
  Start/Restart Rotation Now.
- `event-control.html`'s own separate stage-then-activate one-off event
  config (`personal`/`clock` playback mode, `stop`/`repeat` end policy).
- ADMIN (`admin.html`) composes both `event-control.html` and
  `channel-control.html` behind one authorized-operator tab bar.

## 4. What only works through engineering/manual intervention

- **Getting an already-exported local package onto the real public URL**
  (`https://radio.studiorich.tv/...`) — `music/scripts/publish-radio-to-sites.mjs`
  is a terminal-only Node script; no UI button triggers it. Until this runs,
  a Program created via the UI (which always points at the public URL, by
  design) references a URL that 404s.
- **Editing or deleting a `radioPrograms` document** — `EventRadioRepository`
  has no `updateRadioProgram`/`deleteRadioProgram` at all, in the interface
  or any implementation. A mistaken Program is create-only-forever; the
  only way to stop it mattering is to never put it in a Channel's rotation
  (or remove it from rotation, which the UI DOES support) — the document
  itself is permanent without direct Firestore console access.
- **Any form of scheduled/future-dated/recurring programming** — see the
  capability matrix (§7 below); none of this exists in the domain model at
  all, so no amount of UI work alone would expose it.
- Actual deployment of `studiorich-orbital` itself to the live public
  domain is a further, separate concern this recon didn't re-investigate
  (see `../DEPLOYMENT.md`).

No point in the chain from "playlist exists in MUSIC" through "Program
created" through "Channel rotation updated" requires Claude/Codex, manifest
hand-editing, or manually-copied IDs — that much of the brief's assumed gap
does not exist. The ONE real terminal-only step is the Sites-publish script.

## 5. Are multiple playlists/packages/programs already structurally supported?

**Yes, unambiguously, at every layer:**
- `PlaylistProject` is keyed by `projectId`; `PlaylistsGrid` manages a list,
  not a singleton.
- `RadioPlaylist` is keyed by its own id, `sourceMusicPlaylistId` linking
  back; multiple RadioPlaylists coexist (`radioPlaylistsRef` is an array).
- A `RadioWebExportRecord`/package is identified by `{slug, bundleVersion}`;
  `soft-motion-radio` v1 is simply the only one anyone has published in
  this checkout so far, not an architectural ceiling — `jungle-fade` and
  `new-playlist` also already exist as further already-exported local
  packages, confirming multiple packages are routine, not exceptional.
- `radioPrograms` is a real Firestore collection (`generateRadioProgramId()`
  generates independent, non-sequential ids); `channel-control.html`'s own
  rotation editor already assumes and lists multiple Programs.
- `radioChannels` is a real collection keyed by `channelId`, "V1 has
  exactly one Channel, but nothing about this schema assumes that" (the
  schema's own doc comment).

Nothing here needs new "multi-X" plumbing for β0.1 — it already exists.

## 6. Exact meaning/capability of current Channel rotation

`RadioChannelRotation = { anchorAtMs: number, programIds: string[] }`.
`anchorAtMs` is the fixed epoch-millisecond instant `programIds[0]` began
its first cycle; `resolveChannelRotation` is a pure function of
`(rotation, now)` that walks the ordered `programIds` (each joined against
its own `radioPrograms/{id}.totalDurationSeconds`), summing durations
modulo the total rotation length, to answer "which Program owns airtime
right now" — a **continuously repeating cycle**, not a calendar. The ONLY
write that changes `anchorAtMs` is Start/Restart Rotation Now (always
`Date.now()` at click time); ordinary rotation edits (add/remove/reorder,
Save Rotation) deliberately preserve it unchanged. `status` is a flat
`"active"|"inactive"` — no "scheduled to activate later" state exists.
There is no day/time/calendar field anywhere in `RadioChannel`,
`RadioChannelRotation`, or the editor's own update-builders.

## 7. Scheduling capability matrix

| Case | Status |
|---|---|
| A. Program A → B → C in a repeating rotation | **Supported now** — exactly what Channel rotation already does, through real UI |
| B. "Program B begins tonight at 9 PM" | **Not represented by the current domain model** — `anchorAtMs` is only ever "now"; no scheduled-future-start field exists anywhere |
| C. "Program C runs 2–4 PM, then RADIO returns to the normal rotation" | **Not represented** — Channel has exactly one rotation; there is no time-boxed override concept, and `eventProgram/current` (the only other stateful RADIO config) has no scheduled end time either |
| D. Recurring scheduled programming (every Friday 8 PM) | **Not represented** — no day-of-week/calendar concept exists anywhere in either `RadioChannel` or `EventProgramState` |
| E. One-time LIVE/event programming | **Partially supported by domain model, UI exists for the manual half**: `eventProgram/current`'s stage-then-activate (`ready`→`active`) lifecycle already lets an operator manually flip a one-off config live via `event-control.html`. What's missing is genuine *scheduling* (a future-dated auto-activate) and any integration with Channel (it's a fully separate, parallel authority — turning it on does not pause/override Channel rotation) |

## 8. Smallest β0.1 implementation gap

Given the headline finding, the gap is much narrower than "build the
operator workflow":

1. **A UI (or at minimum a documented one-click local task) for the
   Sites-publish step** — the one genuinely terminal-only link in the
   chain. Smallest version: an ADMIN-visible button/panel that shells out
   to (or reimplements, server-side) `publish-radio-to-sites.mjs` for an
   operator-selected already-exported slug/version. This is the one item
   that actually blocks "prepare and schedule multiple RADIO playlists
   without terminal commands."
2. **`updateRadioProgram`/`deleteRadioProgram`** (or at least a
   deactivate/archive flag) on `EventRadioRepository` — not currently
   needed for the HAPPY path (create → add to rotation already works
   fully through UI) but a real gap for correcting mistakes without
   direct Firestore access. Lower priority than #1 for β0.1's own stated
   minimum.
3. **Scheduling itself (B/C/D from the matrix)** is a genuine, not-yet-
   designed domain-model gap, not a missing UI wrapper around an existing
   primitive — this is real, new work, correctly out of scope for THIS
   recon and flagged for a dedicated future design pass rather than
   estimated here.

## 9. Recommended implementation sequence (recon only — not implemented)

1. Close the Sites-publish gap (§8.1) — the one item that currently forces
   terminal use in an otherwise-complete UI chain.
2. Add Program update/deactivate (§8.2) — small, additive, unblocks
   mistake recovery without touching Channel/rotation semantics.
3. Only THEN design actual time-based scheduling (B/C/D) as its own,
   separately-scoped batch — it is new domain modeling, not a UI gap, and
   deserves its own recon/spec pass rather than being bolted onto #1/#2.

## 10. Risks/debt that should NOT block β0.1

- The Program create-only limitation (no update/delete) is annoying but
  not blocking — mistaken Programs can simply be left out of any Channel's
  rotation; they don't broadcast just by existing.
- `programFromManifest.ts`'s HTTPS-only bootstrap path is a SEPARATE,
  currently-unused-by-the-main-flow convenience for recovering a Program
  from an already-public manifest URL directly (e.g. disaster recovery) —
  not a blocker, not something to weaken for β0.1's own happy path.
- The Sites-publish script's own safety properties (byte/hash verification
  before any copy, atomic rename, active-pointer-only-updated-after-success)
  are already solid; wrapping it in UI should preserve them, not rebuild
  them.
- Multiple packages already coexisting locally (`soft-motion-radio`,
  `jungle-fade`, `new-playlist`) is evidence the multi-package path is
  already exercised in practice, not just structurally possible.

## 11. Future clock-scope note (architecture guidance only — nothing built)

RADIO does not conceptually own StudioRich time. RADIO currently consumes
one GLOBAL clock (`Date.now()`/`nowMs`, the same wall-clock instant for
every listener — `resolveChannelRotation`/`resolveChannelTrackBroadcast`
are pure functions of `(state, nowMs)`, no per-listener cursor). Future
StudioRich experiences may need other clock scopes, independent of
audience scope:

- **GLOBAL CLOCK** — shared across the overall experience/broadcast (what
  RADIO already uses).
- **GROUP CLOCK** — shared by a bounded session/group (e.g. a RACETRACK
  race or a multiplayer mission) — its own start reference, not tied to
  wall-clock `Date.now()` the way RADIO's Channel clock is.
- **INDIVIDUAL CLOCK** — anchored to one participant/session's own start.

Audience scope and clock scope are independent axes — e.g. a GROUP-scoped
chat may still listen to GLOBAL-scoped RADIO simultaneously. Future LIVE
state/effects may layer on top of clock-driven authored content (RADIO's
own Program/Channel model being one instance of "clock-driven authored
content," not the general case). **No Clock subsystem is being built now,
and RADIO is not being refactored around this idea** — this is recorded
purely so a future multi-experience clock design doesn't have to reverse
an implicit assumption that RADIO's own global wall-clock model is the
only or universal pattern.
