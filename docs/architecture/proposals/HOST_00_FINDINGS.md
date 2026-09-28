# HOST-00 browser feasibility findings

Date: 2026-09-27. Scope: isolated local experiment; no HOST-01, application
navigation changes, Firebase access, or deployment. This records evidence for
[the proposed HOME boundary](HOME_PERSISTENT_HOST_V1.md), not a shipped HOME.

## Environment and evidence limits

Actually tested: desktop Google Chrome, user agent `Chrome/153.0.0.0`, macOS,
existing profile, native CUA click/keyboard events (`isTrusted: true`). The fresh
headed-profile automation attempt stalled before evidence and was interrupted.
No successful fresh-profile test, Safari, Firefox, iOS, real artwork, production
RADIO, or human audible verification is claimed. No autoplay-bypass setting was
applied by this experiment; existing profile policy/media engagement was not
reset. Instrumentation demonstrates browser playback and signal, not guaranteed
speaker output or absence of sub-sample audible glitches.

Topology: `tools/host-00/server.mjs` runs existing Vite at
`http://127.0.0.1:5199`, with application config/env loading disabled. Both public
path equivalents explicitly serve the same parent HTML; `/surface.html` is its
same-origin child. Parent imports the unchanged DualDeckPlaybackEngine and uses
its two HTMLAudioElements, shared AudioContext and existing readiness method.
A local generated WAV supplies media. No Firebase or remote content is involved.

## Decision matrix

All PASS statements are scoped to the tested desktop Chrome harness.

| Assumption | Result | Evidence / constraint |
|---|---|---|
| Synchronous child → parent audio activation | PASS WITH CONSTRAINT | Trusted child click and synchronous parent call both observed active; play resolved. Existing profile only; fresh-profile/cross-browser acceptance remains open. |
| HTMLAudioElement playback | PASS | Playing, unmuted, volume 0.2, gain 1, advancing position, no media error. |
| AudioContext activation | PASS WITH CONSTRAINT | Running, connected source, nonzero analyser peak ~0.01098666. Browser/profile scope as above. |
| Parent playback across child replacement | PASS WITH CONSTRAINT | Same parent session, one engine allocation, same two audio objects; MAP/BLACKBOOK cycles and child reload produced no pause/seek/load/play restart after readiness. Physical listening and other browsers unverified. |
| Top-level HOME history | PASS WITH CONSTRAINT | Parent pushState plus controlled child location.replace gave one Back step per surface and correct Forward in the compliant sequence. Independent child navigation is forbidden; readiness reconciliation is required. |
| Artwork replacement semantics | PASS | Parent A → B replaceState kept history length 7; Back skipped selections, Forward restored B. Child-only replaceState changed only child URL, demonstrating need for parent authority. |
| Direct-entry/canonical URL feasibility | PASS WITH CONSTRAINT | Reload, new-tab B, direct A and MAP booted HOME at visible canonical paths. Requires explicit delivery of the host at those paths; current application routes were not changed or validated. |
| Iframe history isolation | PASS WITH CONSTRAINT | Controlled replacement worked. Automatic isolation is false: iframe.src and child links consumed Back steps. Independent child replace also caused a Forward route mismatch. |
| Basic pointer/focus/input | PASS | Trusted child pointer/key events; typed HOST00; Tab input → last child button; Shift-Tab first child button → parent link; parent MAP control remained usable. Full accessibility/real canvas tests deferred. |

No critical failure of the selected parent-owned, controlled-navigation model
was observed. The alternative assumption that arbitrary iframe navigation is
history-isolated **FAILS**. The existing proposal already disallows that model;
the readiness race below strengthens its implementation contract.

## A/B — activation and continuity

Session `8e577ec9-8fd8-47be-a5ba-843bc19d7c3b`:

- Child click: trusted=true, active=true. Parent activation: active=true, delay=0.
- Play resolved with context running; all existing audible-readiness fields
  passed, including positionAdvanced, sourceConnected, nonzero element volume
  and gain, and unmuted output.
- MAP → BLACKBOOK → MAP → BLACKBOOK → MAP, followed by child reload:
  engineCount remained 1, audioIdentityStable remained true, context running.
  Observed positions included 6.297970, 11.797333, 14.797989, 17.797333 and
  20.798189 seconds. No navigation-induced media pause/seeking/emptied/play
  event appeared after readiness. The analyser remained nonzero.
- OFF destroyed playback; following reload began with engineCount=0.

Session `ae84bb7b-5112-4fcc-a72f-dbd74decafda`: six-second delayed loading after
synchronous prime succeeded. The observed DOM snapshot showed play-resolved at
6272.9 ms with active=false, context=running; readiness at 6474.9 ms was ok=true.
The periodic raw log did not capture every last event before the following
OFF/reload; the delayed success is preserved here from the observed DOM output,
not asserted by the raw-log verifier. This delay is after activation, never a
promise/timer between the child click and the parent activation method.

## C — controlled history, artwork, entry

Session `39c02a19-4af0-4247-bade-6a008efef06b` exercised:

1. MAP → BLACKBOOK; history length 7.
2. Artwork A → B through parent replaceState; length stayed 7.
3. MAP; length 8.
4. Back → BLACKBOOK B; Back → previous MAP; Forward → BLACKBOOK B.
   The same parent session persisted throughout all three traversals.
5. Reload → new parent session `0f893dc5-a66a-41fd-ba30-8c14ad541771`, B
   passed to the child, engineCount=0. This is recovery/bootstrap, not continuity.

A later real target=_blank click produced independent session
`1746fe6e-e7c4-4b94-a9d7-3d4b08d8f80d`, URL `/blackbook.html?artwork=B`,
child `surface=blackbook&artwork=B`, history length 1, engineCount=0.
Direct navigation to copied-equivalent `/blackbook.html?artwork=A` and
`/wall-app/` showed the corresponding child route. No clipboard content or
real Artwork data was used; A/B are test route tokens.

Canonical paths are feasible because the harness server explicitly returns
parent HTML for each. History API alone cannot make reload fetch a different
document. V1 must deliver host entry artifacts or explicit rewrites/dispatch
at every eligible public path, before current surface boot and before a generic
fallback. No opaque HOME query string or redirect is necessary in this tested
mapping. Production/static and development parity remains a HOST-01 test.

## D — independent iframe navigation

Session `5b6d20e0-4fa1-422a-85b7-344d32da9c55`:

- Parent iframe.src assignment: length 8 → 9, top remained BLACKBOOK B. One
  Back restored only the old child; top URL did not change. No parent popstate
  was recorded for this child-document-only traversal.
- Ordinary child link similarly consumed a Back step while top stayed B.
  It replaced the previously forward entry, so length alone did not increase;
  the observed Back behavior proves the extra nested-history navigation.
- Child location.replace kept length 10; one Back reached MAP. However Forward
  restored `/blackbook.html` with `surface=child-replaced` in the child, despite
  the parent's popstate handler requesting `surface=blackbook`. Browser child
  history restoration competed with the parent's replacement. Do not treat
  synchronous popstate handling as final route agreement.
- Child artwork replaceState kept length 10, changed child query to
  `artwork=child-only`, and left the top URL `/blackbook.html` unchanged.

Required consequence: parent owns route and Artwork URL state; child navigation
must request that authority. A child ready/load report must be checked against
the latest parent route/navigation id after history restoration, with bounded
replacement or explicit error on mismatch. Do not push corrective history or
loop indefinitely. This reconciliation is not implemented in HOST-00; the
adversarial diagnostic intentionally preserves evidence of the mismatch.

## E — focus, errors, and limitations

Native pointer event on the input was trusted; keyboard typing produced HOST00.
Tab focused the last child control. Shift-Tab from the first child control
focused the parent's canonical link. Clicking the parent MAP button afterward
worked. This establishes basic feasibility only: no drawing, pointer-capture,
responsive canvas, screen-reader, or mobile acceptance is claimed.

When the local server stopped between turns, Chrome loaded an opaque-origin
error document in the iframe; harness telemetry reading child location threw
SecurityError. The harness now records childReadError instead. After restart,
normal boot was verified and the second test tab reported no warning/error logs.
The server outage/error episode is excluded from the successful history/audio
sequence; it is not a production bug or a clean-console claim for the whole run.

## Verification and retained evidence

- `node --check` passed for server.mjs, parent.js and run-chromium.mjs.
- `node tools/host-00/verify-evidence.mjs /tmp/host-00-browser-evidence.ndjson`
  passed over **651 recorded snapshots**. Checks actual recorded trusted
  activation, identity stability, running signal/position, no navigation media
  restart, artwork replacement, traversal events, child URL isolation, and Tab.
  It is evidence analysis, not a substitute for browser experiments.
- Raw log retained locally, uncommitted (generated runtime evidence):
  `/tmp/host-00-browser-evidence.ndjson`, SHA-256
  `cefe598c468a666fc0073a4b8256b4c1643fa91f53119ad49e042c9f94eaa8c5`.
- `run-chromium.mjs` preserved but marked unvalidated; it did not supply results.
- No production build/typecheck/application regression suite run: changes are
  isolated harness/docs, with actual Vite launch and real-engine browser import
  exercised. Documentation links and whitespace checked before commit.

## Gate / handoff

HOST-00 is concluded with constraints. A separately authorized **opt-in local
HOST-01 skeleton** is safe to begin with parent-only history and explicit route
readiness validation. This does not clear the full browser acceptance gate:
fresh-profile autoplay, Safari/Firefox/iOS, real surfaces, audible listening,
production entry delivery, auth/persistence and suspension remain unverified.
Do not enable public HOME routes or move production RADIO based on these results.
Preserve the existing engine, resolver, MAP/BLACKBOOK and identity implementations.
Stop here; HOST-01 has not begun.
