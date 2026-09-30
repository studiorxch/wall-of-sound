# RADIO Architecture Map

Read this before any RADIO-related task. See [../README.md](../README.md)
for what this directory is. This page describes what's true now, not how it
got that way.

## The pipeline

```
MUSIC
  ↓ Send to RADIO
RadioPlaylist
  ↓ Publish
immutable RadioWebManifest Package
  ↓ referenced by
Program
  ↓ (RADIO-04) optionally scheduled by
RadioScheduleBlock                       -- Program x Channel x start x end
  ↓ takes priority during its own window
Channel                                   -- otherwise: continuous rotation
  ↓ deterministic wall-clock resolution
Broadcast State
  ↓ consumed by
RADIO / MAP / BLACKBOOK / future surfaces
```

**`RadioPlaylist ≠ Package ≠ Program ≠ Schedule ≠ Channel`** — five distinct
things, never collapsed into each other. A Program does not need a Schedule
entry to be heard (Channel rotation plays it on its own repeating cycle);
a Schedule entry only ever narrows WHEN a specific Program temporarily wins
over that same rotation — see "RADIO Schedule (RADIO-04)" below.

## Identity

```
RadioPlaylist.id                 authoring identity        (music/src/data/radioPlaylistTypes.ts)
{stationId, bundleVersion}       immutable package identity (music/src/data/radioWebBundleTypes.ts)
programId                        operational Program identity (generateRadioProgramId(), independent of package identity)
channelId                        broadcast Channel identity  (fixed "studiorich-radio" for the first Channel)
RadioScheduleBlock.id             one scheduled occurrence's identity (generateRadioScheduleBlockId(), RADIO-04)
seriesId                          groups occurrences generated from ONE recurring request; null for a one-off — never re-derives an occurrence, history/grouping only
slug + version                   public routing identity ONLY — never used as Program/Channel identity
```

Every layer above is keyed for multiplicity by design, not V1-only: multiple
MUSIC playlists (`PlaylistProject`, keyed by `projectId`, never a singleton),
multiple `RadioPlaylist`s (each carrying its own `sourceMusicPlaylistId`
link), multiple published Packages (multiple `stationId`s, and multiple
`bundleVersion`s per `stationId`), and multiple `radioPrograms` documents
already coexist today (three real published packages on disk —
`soft-motion-radio`, `jungle-fade`, `new-playlist` — and Program ids are
independently generated, never derived from a package or Channel). V1 ships
with exactly one Channel (`"studiorich-radio"`), but nothing in the
`radioChannels` schema assumes a single Channel.

**A MUSIC Playlist that has already been sent to RADIO keeps a STABLE
1:1 `RadioPlaylist` identity for its entire life (batch 0929-4).**
`RadioPlaylist.id` never changes and is never re-minted by an ordinary
edit — `sendPlaylistToRadio`
(`music/src/logic/radio/musicToRadioPlaylistSync.ts`) always updates the
existing record found by `sourceMusicPlaylistId`, regardless of its
`state`. (A prior doctrine — "a PUBLISHED RadioPlaylist forks a fresh
draft identity on re-send" — was removed after human acceptance exposed
it as a real defect: editing a MUSIC playlist's title and re-sending
produced two RadioPlaylists for one MUSIC playlist. Package immutability
was never actually protected by that fork; it's independently guaranteed
at the export-record layer — see "Channel rotation semantics" section's
sibling, `radioWebBundleWriter.ts`'s own version-increment/refuse-
overwrite logic.) `RadioPlaylist.version` is legacy/historical only — it
no longer changes; real publication versioning is
`RadioWebExportRecord.bundleVersion`.

**Human acceptance — RadioPlaylist identity stability, commit `68dac17`
(2026-09-29).** Real operator sequence: existing RADIO Playlist titled
`β0.1.2` → source MUSIC Playlist renamed to `β0.1.3` → Send → RADIO again
→ PASS: the existing RADIO Playlist updated to `β0.1.3` in place; RADIO
Playlist count remained unchanged (5); no duplicate RADIO Playlist was
created.

## Authority

```
Firestore radioPrograms          Program catalog
Firestore radioChannels          Channel authority (status + rotation: anchorAtMs + programIds)
Firestore radioScheduleBlocks    canonical Schedule authority — Program x Channel x start x end (RADIO-04)
Firestore eventProgram/current   single active event config (personal/clock playback mode)
immutable public manifest        package/content authority (radio-manifest.json — trackCount, totalDurationSeconds, etc., all read verbatim, never recomputed by a consumer)
sessionStorage                   Personal resume ONLY (radioResumableSession.ts) — never broadcast authority
MUSIC IndexedDB                  MUSIC authoring ONLY — never a source of truth for anything published
```

## Canonical runtime path

```
resolveChannelRotation                    "Channel Clock" — which Program owns airtime right now
  (music/src/logic/radio/channelRotation.ts)

hydrateChannelRotationFromCatalog         joins persisted programIds[] against the live radioPrograms catalog
  (music/src/logic/radio/channelRotationHydration.ts)

resolveCurrentChannelBroadcast            composes Channel lookup → hydration → rotation resolution
  (music/src/logic/radio/currentChannelBroadcast.ts)

resolveTrackAtProgramOffset               "Program Clock" — which track owns the resolved offset
  (music/src/logic/radio/channelTrackPosition.ts)
  — deliberately NOT the same resolver as resolvedBroadcastState.ts's
    resolveProgramPosition, which models a different, independently
    operator-configured timeline. Never merge these two.

resolveChannelTrackBroadcast              composes the Channel clock + Program clock + manifest fetch
  (music/src/logic/radio/channelTrackBroadcast.ts)

resolveChannelTrackBroadcastWithSchedule  RADIO-04 -- explicit priority wrapper: an active
  (music/src/logic/radio/               RadioScheduleBlock's own Program wins for its own
   radioScheduleBroadcastPriority.ts)    window; otherwise delegates to
                                         resolveChannelTrackBroadcast UNCHANGED (byte-identical
                                         call) -- see "RADIO Schedule (RADIO-04)" below. This is
                                         the function the REAL listener path now calls.

channelListenerPlayback.ts                drives real audio via DualDeckPlaybackEngine
  (music/src/audio/DualDeckPlaybackEngine.ts)
```

Every resolver above is a **pure function of `(state, nowMs)`** — no stored
cursor, no `setInterval`-driven position advancement. A `setInterval` may
exist purely to *refresh a display* (explicitly disclaimed as not being
broadcast authority when it does) — it never advances playback state itself.

A resolution or fetch failure is returned/reported verbatim — **authority,
not availability**. A missing/malformed/duplicate Program reference
invalidates the whole rotation resolution (all-or-nothing), never a silent
partial result or a fallback to a different track.

Every resolver above takes `nowMs` from the ordinary system wall clock
(`Date.now()`) — RADIO consumes this shared, ordinary clock, but RADIO is
not its owner and should not be documented as StudioRich's universal time
authority. Nothing about `resolveChannelRotation`/`resolveChannelTrackBroadcast`
requires or grants RADIO that role; it is simply the one system that
currently reads `Date.now()` this way.

## Channel rotation semantics

`RadioChannelRotation = { anchorAtMs: number, programIds: readonly string[] }`
is a **continuously repeating cycle, not a calendar**: there is no day/time/
calendar field anywhere in `RadioChannel`, `RadioChannelRotation`, or the
Channel Control editor's own update-builders. `anchorAtMs` is the fixed
epoch-ms instant `programIds[0]` began its first cycle; it is changed ONLY
by "Start/Restart Rotation Now" (always `Date.now()` at click time) —
ordinary rotation edits (add/remove/reorder, Save Rotation) leave it
unchanged.

**`RadioChannelRotation`/`anchorAtMs` themselves still represent none of
this — unchanged by RADIO-04.** There is still no future-dated-start,
time-boxed-override, or recurring/calendar field anywhere on
`RadioChannel`/`RadioChannelRotation`, and nothing in this batch added one
— `anchorAtMs` is changed by exactly the same one action as before
("Start/Restart Rotation Now"), never by a Schedule write. What RADIO-04
added is a SEPARATE authority (`radioScheduleBlocks`, see "RADIO Schedule
(RADIO-04)" below) that can win priority over rotation for a bounded
window, without rotation itself ever being mutated, paused, or restarted
to make that happen. Do not read the existence of Schedule as rotation
having grown a calendar — it hasn't; a second, explicit-priority authority
was added instead, exactly as this architecture's own prior recon required
("do not fake those capabilities using anchorAtMs if they are not
represented by the current model").

**An inactive Channel may have an empty default rotation. An active
Channel requires at least one default Program. Scheduled programming is
independently capable of taking priority during its window (RADIO-04D).**
`isValidRotationShape`/`decodeRadioChannel`
(`firestoreRadioChannelRepository.ts`) and the `radioChannels` Firestore
rule are all status-aware: `rotation.programIds.length === 0` is rejected
(write) and treated as malformed (read) only when `status === "active"`.
An `inactive` Channel with `programIds: []` is a real, valid, visible
document — it simply has no default fallback outside a scheduled window,
which every consumer in this chain (`hydrateChannelRotationFromCatalog`,
`resolveChannelRotation`, `resolveCurrentChannelBroadcast`) already
reports as a graceful, typed failure state (`"channel-inactive"`,
`"hydration-failed"`, `"empty_entries"`), never a crash or a fabricated
Program. This was already true before RADIO-04D for every OTHER reason a
rotation could be empty/invalid — the only thing this batch actually
changed is that "an inactive Channel with zero Programs" became a state
that can exist at all, by relaxing the write/read validation for that one
combination. Scheduled programming (`resolveChannelTrackBroadcastWithSchedule`,
above) was already structurally independent of Channel status/rotation
before this batch — it resolves an active `radioScheduleBlocks` entry's own
Program directly, never consulting `channel.status`/`channel.rotation` at
all, so a Channel can already be legitimately "played" during a scheduled
window regardless of whether it has any default Programs of its own.
`RadioNewChannelDialog.tsx` (RADIO → Programming's own "+" Channel-creation
affordance) creates every new Channel this way — Name only, `status:
"inactive"`, `rotation.programIds: []` — with Program-adding left entirely
to Channel Control, exactly matching the smaller "Publish → Program →
Schedule" chain's own separation of concerns.

## RADIO Schedule (RADIO-04)

The canonical `Program x Channel x start x end` authority, closing the gap
the RADIO/PROMOTER scheduling recon identified: neither `RadioChannelRotation`
(a repeating cycle, no calendar) nor `eventProgram/current` (a global
singleton, no channel reference, no duration) could represent a Program
scheduled for a specific dated window on a specific Channel.

```
Firestore radioScheduleBlocks/{blockId}
  channelId, programId, startAtMs, endAtMs (epoch ms, half-open [start, end)),
  status: "scheduled" | "cancelled", seriesId, recurrence, createdAt/updatedAt/updatedBy
```

**Persistence — materialized occurrences, not a virtual rule.** A recurring
request writes one real, independently-persisted document PER occurrence
(sharing one `seriesId`), never a single rule expanded at read time.
Recurrence is always bounded (`untilMs` or `count` — `validateRecurrence`,
`shared/member-identity/src/firebase/firestoreRadioScheduleRepository.ts`,
rejects an unbounded rule), specifically so every occurrence CAN be
materialized up front. This means: **editing/cancelling a series never
touches a past, already-aired occurrence** — each occurrence is its own
document; nothing here ever re-derives one from a rule. A block is never
hard-deleted (`firestore.rules`' own `allow delete: if false` for this
collection, not just an app-level omission) — correcting a mistake means
cancelling the occurrence (`cancelScheduleBlock`, status only, never
deleted) and creating a fresh one.

**Recurrence support: `none` | `daily` | `weekly`, bounded by `untilMs`,
`count`, or (RADIO-04B) the explicit `openEnded` marker.**
`music/src/logic/radio/radioScheduleRecurrence.ts`'s `materializeOccurrences`
generates every occurrence at creation time, with a hard safety cap
(`MAX_RADIO_SCHEDULE_OCCURRENCES = 366`) independent of whatever bound the
operator requested — this cap is unconditional, including for `openEnded`.
Monthly/custom-interval recurrence and any calendar-grid concept
(Day/Week/Month) are NOT implemented — the operator UI
(`RadioProgrammingView.tsx`) is a weekly VIEWPORT onto real dated weeks
(Prev/This/Next), never the data boundary; a Month calendar was explicitly
out of scope for this batch.

**`openEnded` ("Never" in End Repeat) — an honest marker, not a fabricated
bound (RADIO-04B recon + minimal fix).** Human acceptance required a
"Never" End Repeat choice; the canonical materialized-occurrence model
(above) is deliberately bounded-only, and "silently translate Never into
366 occurrences and call that indefinite" was explicitly ruled out.
`RadioScheduleRecurrence.openEnded: true` is the smallest correct
representation found: `validateRecurrence` now requires EXACTLY one of
`untilMs` / `count` / `openEnded` (an omitted bound is still a validation
error — never silently reinterpreted as intentional), and when `openEnded`
is chosen, materialization still only ever writes the same real, bounded
first batch every other request writes (up to 366) — the difference is
TRUTH, not write behavior: the persisted record honestly says "open-ended,
N materialized so far" instead of a `count` the operator never chose.
**Deferred (recon only, not implemented this batch):** true indefinite
recurrence — a materialized horizon that keeps extending forward over
time without an operator noticing it ran out — needs an actual
architectural addition: a series/rule authority (e.g. a
`radioScheduleSeries` document per `seriesId`, storing the open recurrence
rule and a `materializedThroughMs` cursor) that a later mechanism (a
scheduled job, or an on-demand check when `RadioProgrammingView.tsx` views
a future week near the horizon) reads to materialize the NEXT bounded
batch, extending `materializedThroughMs` while leaving every
already-materialized (possibly already-aired) occurrence untouched. This
is a real, scoped, buildable follow-up — not implemented here.

**Conflict prevention — explicit rejection, never silent override.**
`findRadioScheduleConflicts` (pure, exported from
`firestoreRadioScheduleRepository.ts`) checks every candidate occurrence
against every OTHER existing non-cancelled block on the same Channel, and
against every other candidate in the same batch (a bad recurring request
can self-conflict). `createScheduleBlocks` re-checks this server-round-
trip-side (the UI's own pre-check is a courtesy, never the enforcement
boundary) and rejects the WHOLE batch — nothing is written — on any
overlap. Half-open interval: a block ending exactly when another starts is
not a conflict.

**Channel priority — explicit resolution, never rotation mutation.**
`resolveChannelTrackBroadcastWithSchedule`
(`music/src/logic/radio/radioScheduleBroadcastPriority.ts`) is the ONE new
decision point, and the exact wrapper this architecture's own priority
model requires:

```
BEFORE a scheduled window  -> resolveChannelTrackBroadcast() unchanged.
DURING a scheduled window  -> the scheduled block's own Program wins,
                               resolved here (loops its own manifest via
                               the same modulo-cycle math rotation already
                               uses, if the window outlasts the Program's
                               own duration -- the "one 6-8 hour Program
                               repeatedly" bootstrap case).
AFTER a scheduled window   -> resolveChannelTrackBroadcast() unchanged
                               again -- NO special "rejoin" logic exists or
                               is needed, because that resolver was ALREADY
                               a pure function of (state, nowMs) with no
                               stored cursor BEFORE this batch (see
                               "Canonical runtime path" above). Simply not
                               intercepting after the window ends is
                               sufficient by construction.
```

`anchorAtMs`/`RadioChannelRotation` are never read for writing anywhere in
this module — structurally impossible, since the Channel repository type
it depends on (`Pick<RadioChannelRepository, "getRadioChannel">`) has no
update method at all. Verified directly:
`radioScheduleBroadcastPriority.test.ts`'s own dedicated test asserts
`anchorAtMs` stays byte-identical across resolution calls before, during,
and after a scheduled window.

**Wired into the real listener path.** `createRadioChannelReceiver.ts` (the
ONE canonical listener factory every real surface — MAP, BLACKBOOK,
standalone — already goes through) now passes a thin closure wrapping
`resolveChannelTrackBroadcastWithSchedule` as `channelListenerPlayback.ts`'s
existing `resolve?: typeof resolveChannelTrackBroadcast` injection point —
zero changes to that file's own types or logic. When no block is active,
this closure delegates 100% to the exact same function every other
consumer (Channel Control, diagnostics) still calls directly — behavior is
byte-identical to pre-RADIO-04 whenever nothing is scheduled.

**Program creation/reuse moved here — no longer in Playlist Publication
Tracking.** `RadioPlaylistPublishPanel.tsx` no longer offers Create/Update
Program at all (see "Operator playlist/programming workflow" below for the
corrected chain). `music/src/logic/radio/radioProgramLifecycle.ts`'s
`resolveProgramForSchedule` is the ONE place `createRadioProgram`/
`updateRadioProgram` are called for scheduling — reuses RADIO-03's exact
`planProgramLifecycleAction` decision (create / update-in-place / already-
up-to-date / ambiguous-needs-operator-choice), never a second Program-
construction path. `listSchedulablePlaylists` gates which RadioPlaylists
even appear in the scheduling picker on the same "real export AND matching
Sites publication" discipline the old Publish-panel Program buttons used
— **RADIO-04B fix:** it offers the newest export version that IS
Sites-published, not necessarily the Playlist's single overall-newest
export. The original version required those to be the same export,
which silently dropped an already-published, already-live Playlist from
the scheduler the moment ANY later local re-export existed for it (even
one never itself republished) — exactly the "require republishing merely
to satisfy the scheduler" friction human acceptance flagged.
`RadioPlaylistPublishPanel.tsx`'s own `sitesPublicationForLatestExport`
still answers a different, narrower question (is the newest version
specifically live, for its own "ready to publish" messaging) and keeps
its original behavior — scheduling answers "is ANY version of this
Playlist live," which is what "already-published Playlist/Package state"
actually means for this workflow.

**Operator identity is recovered in-place, not via a detour through Event
Radio Control (RADIO-04A, corrective pass).** The first human acceptance
attempt found that `RadioProgrammingView.tsx` linked out to
`event-control.html` to sign in, then depended on Firebase Auth's cross-tab
`browserLocalPersistence` sync to reflect that session back in the
already-open Programming tab — in practice this left the operator stuck:
signed in on one tab, still reading `signedOut` on the other. The fix is
not a second identity system; `RadioProgrammingView.tsx` now calls
`signInWithGoogle()`/`signOut()` directly on the exact same shared
`MemberIdentityAuthority` instance every RADIO surface already resolves via
`createFirebaseMemberIdentityAuthority` (one authority per Firebase app,
registered in a module-level `WeakMap` — see that file's own doc), so the
sign-in and its `onAuthStateChanged` callback now happen in the same
document, with no cross-tab dependency at all. This is the same "wire a
button straight to `memberIdentity.signInWithGoogle()`" pattern
`eventControlRuntime.ts`/`channelControlRuntime.ts`/`adminShellRuntime.ts`/
`blackbookRuntime.ts` already use — MUSIC's own React app was simply the
one surface that hadn't yet, and (confirmed via `homeSurfaceContract.ts`/
HOST-03A recon) MUSIC is never a HOME-hosted surface, so the plain,
un-adapted `signInWithPopup` call these other runtimes use is safe here
too — no HOST-03B credential-relay adapter is needed.

**Public Now/Next/Upcoming — reads the canonical authority, never a second
one.** `music/src/logic/radio/radioPublicProgramGuide.ts`'s
`resolveRadioProgramGuide` composes `findActiveScheduleBlock`/
`findNextScheduleBlock`/`listUpcomingScheduleBlocks` (the same pure
selectors the priority resolver uses) with the existing Channel Clock as
the rotation fallback for `now`. Scope, deliberately smaller than
"predict all future programming": `next`/`upcoming` only ever report
SCHEDULED blocks — normal Channel rotation's own future cycling is not
simulated forward in time (Channel rotation is a repeating cycle, not a
calendar; predicting its far future is a separate, larger capability this
batch does not claim). `now` correctly reflects either source. Rendered
today inside `RadioProgrammingView.tsx` itself (the smallest read
representation proving the authority works) — no separate public product
surface exists yet; future MEMBER reminders/notifications are expected to
consume this same `resolveRadioProgramGuide` function, not a new one.

## What is NOT Channel authority

This section is about the `RadioChannel` DOCUMENT's own authority
(`rotation.anchorAtMs`/`programIds`) — none of the items below ever write
to it or are read by `resolveChannelRotation`/`resolveCurrentChannelBroadcast`.
`radioScheduleBlocks` (RADIO-04) is deliberately NOT listed here even
though it's also a separate collection: it DOES influence what a listener
hears, on purpose, via the explicit `resolveChannelTrackBroadcastWithSchedule`
priority wrapper described above — but it still never reads, writes, or
requires knowledge of the Channel document's own `anchorAtMs`/`programIds`
to do so. That's the distinction: the items below have ZERO influence on
broadcast state; Schedule has bounded, explicit, non-mutating influence.

- **`eventProgram/current`**
  (`shared/member-identity/src/data/eventRadioTypes.ts`) is a separate,
  singleton, manually-staged authority — one Program, one `playbackMode`
  (`"personal" | "clock"`), one `endPolicy` (`"stop" | "repeat"`), advanced
  through `status` (`"inactive" → "ready" → "active"`) only by an operator's
  own `setEventProgram` call. It has no scheduled/calendar end time and no
  relationship to `radioChannels`/Channel rotation at all — never confuse
  this with the Channel Clock.
- **`active.json`** (in `studiorich-orbital`'s `public/radio/`) selects what
  the *existing, separate, package-slug-based* public RADIO player
  (`radio-player.html`/`radioPlayerMain.ts`, and the equivalent page in
  `studiorich-orbital`) considers active. It has no relationship to
  `radioChannels` and is never read by any Channel resolver.
- **MUSIC's own Schedule** (`music/src/logic/scheduleResolver.ts`,
  `scheduleTypes.ts`, `SchedulerGuideView.tsx`) is a MUSIC/Smart-Grid-
  specific concept (no recurrence model, naive timezone display,
  MUSIC-specific vocabulary) — it is not reusable as RADIO Channel
  scheduling and is not the same system.
- **MUSIC's own "now playing"/broadcast HUD**
  (`nowPlayingBroadcastBridge.ts`, `BroadcastSecondaryLayer.tsx`,
  `BroadcastHudShell.tsx`) is a separate, MUSIC-local concept — see
  [../DEBT.md](../DEBT.md). It does not consume or reflect the Channel
  Clock.

## Public package addressing

```
https://radio.studiorich.tv/radio/<slug>/v<n>/
```

This is the one canonical public package base URL, produced by
`buildRadioPublicPackageBaseUrl` (`music/src/logic/radio/radioWebBundlePlan.ts`)
and matching `studiorich-orbital`'s own `publish-radio-to-sites.mjs`
destination convention exactly. `manifestBaseUrl` on a `radioPrograms`
document should always be this — never MUSIC's own `/radio-web-export/...`
dev-server preview route, which exists only for local preview and is never
reachable from production.

## Operator playlist/programming workflow (current facts)

Batch 0929-3 (lifecycle streamlining, on top of RADIO-02's own terminal-only
fix) consolidated the playlist chain to ONE operator Publish action.
RADIO-04 (batch 0929-6) then drew the product boundary explicitly: **the
playlist-publication workflow ends at Publish.** Program creation/update is
no longer a required step of publishing a Playlist — it happens later,
implicitly, behind the RADIO → Programming scheduling workflow, using the
exact same RADIO-03 lifecycle logic (`resolveProgramForSchedule` →
`planProgramLifecycleAction` → `createRadioProgram`/`updateRadioProgram`),
never a second Program-construction path. The full chain has real, working
operator UI end to end, with no Terminal step and no separate manual
"Publish to Sites" click, and no separate manual "Create Program" click:

```
MUSIC playlist authoring (PlaylistsGrid.tsx: create/open/duplicate/delete)
  ↓ "Send to RADIO" (per-playlist button, local-only — writes to MUSIC's
     own IndexedDB state, not Firestore)
RadioMultiTrackPrepWorkspace.tsx — the source RadioPlaylist stays fully
  editable here at every stage, published or not (title is editable
  in-place; entries/lock/include/approve/prepare are never gated on
  export or publication state)
  ↓ "Publish" (ONE button/one progress indicator — internally: validate
     source audio → bulk-prepare/approve every eligible entry → export an
     immutable local Web Bundle version → for a signed-in operator, copy
     that version into the Sites checkout — see "Publish is one action,
     four internal stages" below)
RadioPlaylistPublishPanel.tsx now stops here — "Published vN — ready to
  schedule in RADIO → Programming." No Program button, no Program state
  rendered in this panel at all (RADIO-04 removed
  `handleCreateProgram`/`handleUpdateProgram` and the Program-lifecycle
  state entirely from this file; playlist publication and RADIO
  programming are separate operator workflows, per the Creative Interface
  Doctrine's "does it belong in the current workflow" test).
  ⇩ (separately, whenever an operator chooses to schedule this Playlist —
     not required immediately after Publish)
RadioProgrammingView.tsx ("RADIO → Programming" — a weekly linear/FAST-style
  grid, not a calendar): pick a Channel → navigate to a dated week →
  click an open time slot or an existing block's "+ Program"
  ↓ RadioScheduleBlockDialog.tsx: choose a published, schedulable Playlist
     (`listSchedulablePlaylists` — same "real export AND matching Sites
     publication" gate the old Publish-panel Program buttons used) →
     choose start/end → optionally set bounded recurrence (none / daily /
     weekly, end by date or occurrence count) → Save
  ↓ resolveProgramForSchedule (music/src/logic/radio/radioProgramLifecycle.ts)
     — the ONE place create/update/reuse happens, reusing RADIO-03's
     planProgramLifecycleAction unchanged — then materializes one
     RadioScheduleBlock document per occurrence
channel-control.html's rotation editor (add/remove/reorder Programs via a
  real <select> from listRadioPrograms(), Save Rotation, Activate/
  Deactivate, Start/Restart Rotation Now) — unchanged by RADIO-04; a
  Program still does not need a Schedule entry to be part of normal
  rotation. A RadioScheduleBlock only ever grants that Program TEMPORARY
  priority during its own window (see "RADIO Schedule (RADIO-04)" above).
```

Per-track approval, per-track preparation, the manual "Export Web
Bundle…" dialog, the editorial "Mark Ready for Publishing" flag, and a
manual "Republish to Sites" recovery control all remain real, still-
supported operations — they live behind `RadioPlaylistPublishPanel.tsx`'s
collapsed Diagnostics section as advanced/recovery tools, not routine
steps a successful Publish requires the operator to see or use.

See
[../proposals/RADIO_OPERATOR_WORKFLOW_RECON.md](../proposals/RADIO_OPERATOR_WORKFLOW_RECON.md)
for the original recon (exact files per stage, a scheduling capability
matrix) — its own workflow diagram is now historical, not current.
Current-state facts worth recording here directly:

- **Publish is one action, four internal stages.** `handlePublish`
  (`RadioPlaylistPublishPanel.tsx`) always runs, in order: validate source
  audio → prepare/bulk-approve → export (never mutates a prior version —
  see "Package versioning is append-only and immutable" below) → for a
  signed-in StudioRich operator only, copy the resulting (or
  already-current, if this run was a no-op re-export) version to the Sites
  checkout (`/radio-publish-to-sites`, reusing
  `publish-radio-to-sites.mjs`'s validated logic verbatim — no second
  implementation). A non-operator's Publish still exports the immutable
  local Package correctly; it stops before the Sites-copy stage with an
  explicit reason, never a silent partial success. This preserves RADIO-02's
  exact same authorization boundary — the capability itself didn't change,
  only that it's automatic for an authorized operator instead of a second
  manual click.
- **Package versioning is append-only and immutable — confirmed, not
  assumed.** `music/server/radio/radioWebBundleWriter.ts`'s `exportWebBundle`
  always computes the next `vN+1` from `listBundleVersions` and refuses to
  overwrite an existing version directory (`RADIO_WEB_BUNDLE_VERSION_EXISTS`)
  before an atomic move commits it — there is no code path anywhere in the
  export chain that opens, rewrites, or deletes a prior version's files.
  "Publish New Version" (the button shown once a Package already exists —
  renamed from "Update Published Version" for accuracy) is the exact same
  `handlePublish` action; it creates vN+1, it never updates v1 (or any
  prior version) in place. Editing the source Playlist and republishing
  therefore can never mutate an already-published Package.
- **The source RadioPlaylist remains fully editable after publication —
  confirmed, not assumed.** No control in `RadioMultiTrackPrepWorkspace.tsx`
  (lock, include-in-publish, approve, prepare) is gated on `latestExport`,
  `radioWebExports`, or `radioPlaylist.state`. Its `title` is now directly
  editable in that workspace's header (batch 0929-3; it was display-only
  before — a MUSIC-send-time snapshot with no rename path anywhere).
  `radioPlaylist.state` (`DRAFT`/`PREPARING`/`READY`/`PUBLISHED`/`RETIRED`,
  see `radioPlaylistPublicationState.ts`) is a fully separate, editorial-
  only "reviewed and approved" flag — it has no relationship to whether a
  Package/export exists; never conflate "playlist state PUBLISHED" with
  "Package published to Sites."
- **`radioPrograms` supports update as well as create (RADIO-03, batch
  0929-5) — resolved, no longer open.** `EventRadioRepository` now has
  `updateRadioProgram` alongside `createRadioProgram`
  (`shared/member-identity/src/data/eventRadioTypes.ts`,
  `firestoreEventRadioRepository.ts`) — same required-field shape, same
  `firestore.rules` `allow write` block already covered both (no rules
  change was needed; only the client-side repository method was missing).
  `programId` is never regenerated by an update — every Channel rotation
  slot or `eventProgram/current` reference to it keeps working unchanged,
  because nothing downstream (`hydrateChannelRotationFromCatalog`,
  `resolveCurrentChannelBroadcast`, `resolveChannelTrackBroadcast`,
  `channelListenerPlayback.ts`) caches or denormalizes a Program's own
  Package fields anywhere else — every consumer re-reads
  `listRadioPrograms()` fresh on every resolution, so a Package-reference
  update is picked up by the very next resolution call with no other
  propagation step. As of RADIO-04, `planProgramLifecycleAction`'s
  create-vs-update decision is no longer surfaced as a button in
  `RadioPlaylistPublishPanel.tsx` (that UI was removed — see "Operator
  playlist/programming workflow" above); it now runs inside
  `resolveProgramForSchedule` at scheduling time, so correcting a playlist
  and republishing, then scheduling the new version, still never creates a
  second, redundant Program for the same station. Program
  has no active/inactive field of its own (only `RadioChannel.status` and
  `EventProgramState.status` model any lifecycle state) — deactivate/
  reactivate was deliberately NOT added to Program in this batch; a
  Program's effective "activeness" is already fully controlled by whether
  it's in a Channel's rotation or is `eventProgram/current`'s target, both
  pre-existing control surfaces. Program deletion was deliberately NOT
  added either (Firestore rules already permit it, but nothing in the
  client ever exposes it) — deletion risks orphaning a live Channel/
  `eventProgram` reference and wasn't required by this batch's invariant.
- **Reaching the public domain remains a separate, unautomated step.**
  Publish's Sites-copy stage only writes into the Sites checkout's own
  local working tree. It does NOT commit, push, or deploy. A separate
  `git push` from inside that checkout to its own `origin/main` is still
  required (see [../DEPLOYMENT.md](../DEPLOYMENT.md)) — this batch did not
  touch that step.
- **Publish/Create Program are client-side-gated to the StudioRich
  operator** (`isAuthorizedOperator`, same `STUDIO_RICH_OPERATOR_EMAILS`
  pattern as every other operator action in this codebase) — same posture
  as every other local dev-server route: no server-side auth check exists
  on `/radio-publish-to-sites` or any sibling route, since only the
  operator's own local MUSIC dev server can reach it. This matches
  existing precedent; it is not a new exception.
- **RadioPlaylist identity is stable — see "Identity" above.** A MUSIC
  Playlist already sent to RADIO keeps exactly one `RadioPlaylist` for its
  whole life; ordinary edits (title, track corrections) update it in
  place and never mint a second one.

### Future direction — unified Playlist collection (not implemented)

COLLECTIONS → Playlists (MUSIC's own `PlaylistProject`) and RADIO →
Playlists (`RadioPlaylist`) are planned to eventually collapse into one
presented Playlist collection — RADIO is something you do with a
playlist, not a second copy of it. This is direction, not current state;
no sidebar/collection UI work has been done. Two candidate identity
models were considered when correcting RadioPlaylist's identity handling
(batch 0929-4):

1. one Playlist identity + RADIO-specific state/publication metadata
   attached to it directly, or
2. one source Playlist identity (`PlaylistProject`) + a stable 1:1 RADIO
   projection (`RadioPlaylist`) linked by `sourceMusicPlaylistId`.

**The current implementation safely supports (2), and batch 0929-4's fix
was built to be compatible with it, not to foreclose it.** `PlaylistRecord`
and `RadioPlaylist` are structurally different today (MUSIC's own
slots/curve/locks vs. RADIO's own entries/approval/trackBinding/
publication state) — collapsing them into one type (option 1) would be a
real data-model merge across both systems' logic, not a UI change, and is
out of scope for any batch that hasn't been asked to do it explicitly. A
stable 1:1 projection (option 2) needed only what this batch already did:
a permanent identity link that's always the update target, never forked.
A future sidebar/collection-UI consolidation can present `PlaylistProject`
+ its linked `RadioPlaylist` as one row without requiring a third identity
model or a migration beyond what already exists.

### Human acceptance — real 45-track playlist (2026-09-29)

A real 45-track MUSIC playlist ("β0.1.1"), sent to RADIO and published
through the current one-action Publish flow above, in this exact worktree
once the correct library roots were used (see
[../DEBT.md](../DEBT.md)'s gitignored-asset-mirror entry): MUSIC → RADIO
send PASS; source-audio resolution PASS; one Publish click triggering
automatic bulk preparation/approval PASS (45/45 reached READY, 0 needing
approval, 0 needing preparation, 0 stale/failed); immutable exported
bundle v1 PASS (45 tracks, 149.4 MB); Preview playback PASS. The preview's
`hard_cut (legacy — no approved DJ plan for this pair)` label is expected,
acceptable fallback behavior for a pair with no approved DJ transition
plan — it is not a defect and does not make the DJ-transition project a
dependency of RADIO publication.

## MAP's relationship to RADIO

MAP is now a real receiver of RADIO's canonical Channel — not a description
of future direction, an actual wired integration:

```
music/src/member/radioChannelReceiverRuntime.ts   (real Vite/TS module, its
  own build entry -> assets/radio-channel-receiver-runtime.js -- the ONE
  shared bootstrap script both wall/index.html AND blackbook.html load)
  publishes window.SBE.RadioChannelReceiver (control: turnOn/turnOff/
  setVolume) and window.SBE.RadioChannelReceiverState (read-only), same
  bridge convention subwayMemberRuntime.ts already uses for
  MemberIdentityState.
        ↓
wall/systems/presentation/radioChannelHud.js   (plain JS, wall/'s own
  runtime) -- reads/controls ONLY through that bridge. Computes nothing
  about Channel/Program/track resolution itself.
```

### Persistent ownership under the StudioRich shell (RADIO-01)

**Terminology**: "the persistent StudioRich shell/runtime" below means the
same thing [../home/README.md](../home/README.md) calls "persistent HOME" —
the development-only top-level document that owns cross-surface navigation
(see that page for its own HOST-00–03 history). This page uses "shell/
runtime" specifically to keep that concept distinct from any possible
future HOME *product* surface (a user-facing page/panel) — no such product
surface exists yet; nothing here should be read as implying one does.

Where the actual playback engine lives now DEPENDS on whether MAP/BLACKBOOK
are running standalone or hosted by the persistent shell:

```
Standalone MAP or standalone BLACKBOOK (no persistent shell present)
  radioChannelReceiverRuntime.ts constructs its OWN local
  createRadioChannelReceiver() instance -- exactly the pre-RADIO-01
  behavior, unchanged. This engine dies with the document/tab.

Hosted MAP or hosted BLACKBOOK (persistent shell active)
  radioChannelReceiverRuntime.ts detects hosting (explicit, query-based --
  never bare window.self !== window.top) and requests a handle to the
  shell's OWN persistent RADIO session (music/src/home/homeRadioSession.ts)
  via a new HomeSurfaceHost method, getRadioSession -- gated by MOUNT
  identity (runtime + navigation generation) only, deliberately NOT the
  full route/Artwork identity, so a BLACKBOOK Artwork-only route sync can
  never invalidate an already-granted handle. The underlying engine
  (createRadioChannelReceiver(), the SAME factory the standalone case
  calls locally -- never a second/parallel implementation) is constructed
  lazily, at most once, and reused verbatim across every later surface
  swap for the persistent shell document's own lifetime. Replacing the
  active child surface (MAP <-> BLACKBOOK) never destroys or recreates it.
  A session request the shell rejects (stale/wrong mount identity, or the
  shell not yet "active") fails EXPLICITLY -- the hosted document's own
  receiver becomes a stand-in that always reports {status:"failed"} and
  never plays anything; it NEVER falls back to constructing a local
  engine, which would create a second, competing playback owner.
```

RADIO OFF still means genuinely stop/destroy in both cases -- no paused
position is ever preserved, hosted or not, and a later ON always
re-resolves the Channel's current shared-clock position. Surface
detach/navigation is explicitly NOT equivalent to RADIO OFF: swapping the
active child surface while the persistent shell's session is ON leaves it
ON, unaffected, exactly as verified in this checkpoint's own browser
acceptance (below).

The user-gesture/autoplay constraint HOST-00 already proved for the
persistent shell (a same-origin, synchronous parent-owned call from a
child's own click handler, no `await`/message/timer before the parent's
own engine construction) applies unchanged here: a hosted `turnOn()` call
reaches the shell's session via an ordinary synchronous function call
across the window boundary, so `DualDeckPlaybackEngine.primeForUserGesture()`
still executes inside the original click's own call stack.

Verified via real Chrome acceptance against the local emulator-only HOST
environment: MAP → real Google popup sign-in → BLACKBOOK → MAP preserved
one persistent shell runtime throughout (see
[../home/README.md](../home/README.md)'s own HOST-03B acceptance table);
this RADIO-01 checkpoint additionally verified that turning RADIO ON in
hosted MAP, then navigating MAP → BLACKBOOK → MAP, left the SAME session
state visible on both surfaces without ever resetting to OFF — BLACKBOOK's
own RADIO widget reflected the shell's already-in-flight resolution result
immediately on mount, with no click required. (The local emulator has no
seeded `radioChannels`/`radioPrograms` data, so the observed steady state
was `{status:"failed", reason:"channel-not-found"}` rather than audible
`{status:"on"}` playback -- this proves session/ownership continuity, not
human audible continuity, which automation cannot claim on its own.)

MAP owns no clock, no Program/track resolver, no playback-position
authority of its own — every decision is delegated to the existing RADIO
resolver chain (`resolveChannelTrackBroadcast` / `resolveChannelRotation`).
Turning MAP's receiver OFF and back ON always re-resolves the Channel's
*current* shared-clock position — no locally-remembered pause offset is
ever preserved (verified: OFF resets to `currentTime: 0`; a later ON after
real elapsed time rejoins far past that reset point, not at 0 and not
resumed from where it stopped).

"● LIVE RADIO" reflects the Channel's own `status` field (polled every 10s
via the existing `getRadioChannel` read — no new resolver), independent of
whether MAP's own receiver is ON or OFF — a visual toggle is never treated
as broadcast authority.

Volume is personal, local-only state (`localStorage` key
`wos:radioChannel:volume`), applied via a new, narrow
`DualDeckPlaybackEngine.setMasterVolume()` method that sets the two
persistent `<audio>` elements' own `.volume` directly — a separate
multiplicative layer from the crossfade `GainNode` automation, never
touching transition timing.

Now Playing display is a new, separate transient HUD
(`wos-now-playing-radio`) — reusing `nowPlayingHud.js`'s own visual/CSS
conventions but **not** extending that file, since its own header
explicitly scopes it to MUSIC's local `playbackAuthority.ts` snapshot only
("MUST NOT... read any other MUSIC/RADIO state"). Extending it would have
mixed two separate authorities into one display; a second, RADIO-scoped
HUD following the same pattern preserves that boundary.

Not yet done, deliberately out of this batch's scope: Waveformer
integration (reflecting live RADIO activity visually) — the boundary was
not investigated deeply enough to wire cleanly without risking scope creep;
treat this as the immediate presentation follow-up, not evidence that no
suitable integration point exists.

## BLACKBOOK is a second receiver of the same broadcast

BLACKBOOK (`music/blackbook.html`) is now a real receiver too — the exact
same `radioChannelReceiverRuntime.ts` bridge MAP uses, imported directly
as a real ES module (BLACKBOOK is a real Vite/TS page, unlike `wall/`, so
no `window.SBE` indirection is strictly needed, though the module still
publishes there too for consistency):

```
music/src/member/radioChannelReceiverRuntime.ts   (identical import, same
  channelId "studiorich-radio" — no second Channel, no second receiver
  implementation)
        ↓
music/src/member/blackbookRadioUI.ts   (BLACKBOOK's own thin wiring,
  mirroring radioChannelHud.js's exact behavior for MAP)
```

This replaces BLACKBOOK's previous top-left music control, which was wired
to `eventMusicRuntime.ts` (the separate `eventProgram/current` system,
empty in production — "Event music unavailable"). `eventMusicRuntime.ts`
itself is untouched and remains a real, separate, documented system (see
DEBT.md); it is simply no longer referenced from `blackbook.html`.

**MAP and BLACKBOOK are two independent receivers of the one
`studiorich-radio` broadcast — never two authorities.** This still holds
under RADIO-01: hosted or standalone, there is still only ever ONE
playback-owning engine at a time, its identity just differs by context
(each standalone document's own local engine, vs. the persistent shell's
one shared engine — see "Persistent ownership under the StudioRich shell"
above).

**Standalone** (pre-RADIO-01 behavior, unchanged): entering BLACKBOOK with
RADIO already ON in standalone MAP does not carry a playback session
across (an ordinary top-level navigation to a different document means
only one page-level engine ever exists at a time, by design); turning
BLACKBOOK's own receiver ON resolves the *current* shared position
independently and lands on the same track MAP was playing, correctly
advanced by real elapsed time — never restarting the track at 0. The same
OFF→wait→ON rejoin-at-current-position behavior already proven for MAP
holds identically for BLACKBOOK, because both call the exact same
`resolveChannelTrackBroadcast` chain against the exact same Firestore
Channel — agreement is structural, not coordinated between the two pages.

**Hosted** (RADIO-01): the opposite is now also true and by design — a
session already ON in hosted MAP DOES carry across into hosted BLACKBOOK
(and back), because both are, in that context, thin proxies for the exact
same persistent-shell-owned engine, not two independent local ones.

## Local RADIO acceptance procedure (dev/emulator-only)

The local emulator normally has no `radioChannels`/`radioPrograms` data, so
a fresh local HOST environment resolves `{status:"failed",
reason:"channel-not-found"}` rather than playing anything. To get a real,
audible local broadcast for acceptance testing (no production access, no
new RADIO architecture):

1. An already-exported local package already exists on disk at
   `library/music/RadioWebExports/<slug>/v<n>/` (e.g. `soft-motion-radio/v1`
   — real `.opus` audio, a real `radio-manifest.json`) from a prior MUSIC
   "Send to RADIO" publish run. Served locally, dev-only, by the existing
   `/radio-web-export/` Vite middleware — never reachable from production,
   never the canonical public package URL (see "Public package addressing"
   above).
2. **Known gotcha**: that middleware resolves its library root relative to
   the *actual Node process* working directory, not `music/`. If
   `tools/host-02/server.mjs` is launched from the repo root (as its own
   documented usage shows), pass `PLAY_LIBRARY_ROOT` explicitly, e.g.
   `PLAY_LIBRARY_ROOT="$(pwd)/library/music" node tools/host-02/server.mjs`
   — otherwise the local package 404s. Not a code defect; nothing in the
   repo needed to change.
3. With the Firestore/Auth emulators and `tools/host-02/server.mjs` running,
   sign in as the one allow-listed operator email
   (`STUDIO_RICH_OPERATOR_EMAILS`, `richardjlau@gmail.com`) against the
   **emulator only**, then call the EXISTING repository functions directly
   (`createFirebaseEventRadioRepository().createRadioProgram(...)` with
   `manifestBaseUrl` pointed at the local `/radio-web-export/...` URL, then
   `createFirebaseRadioChannelRepository().createRadioChannel(...)`/
   `updateRadioChannel(...)` to put that Program in an active
   `studiorich-radio` rotation). No UI currently exposes "create a Program
   from an arbitrary manifest URL" end to end — see the RADIO β0.1 operator
   recon below for the gap this reveals. This is exactly what the
   `channel-control.html`/RADIO Publish panel machinery already does
   server-side; nothing new was built, just invoked directly against the
   emulator for a one-off local acceptance pass, never committed as a
   script.
4. Reload the local HOME/MAP page — RADIO ON now resolves to real
   `{status:"on", nowPlaying:{title, artist}}` and plays real audio.

Human audible acceptance using exactly this procedure — see "Human audible
acceptance" in [../home/README.md](../home/README.md)'s own RADIO-01
section.
