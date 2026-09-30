# StudioRich Deployment Facts

Verified current facts, especially for RADIO. See [README.md](README.md) for
what "current" means here — this file should be corrected in place, not
appended to, whenever a fact here changes.

## RADIO public hosting

```
domain:              radio.studiorich.tv
source repository:   studiorich-orbital  (separate git repo, NOT this one —
                       actual local checkout at
                       /Users/studio/Projects/wall-of-sound/studiorich-orbital,
                       NOT under wall-of-sound-beta01)
source branch:        main
DNS:                 studiorich.tv authoritative DNS is now Cloudflare;
                       Porkbun remains the registrar. radio.studiorich.tv is
                       still a CNAME to custom-domains.chatgpt.site, but that
                       record is now Cloudflare-proxied.
production routing:  Cloudflare Worker route radio.studiorich.tv/* executes
                       studiorich-orbital directly — OpenAI Sites remains
                       the origin BEHIND that route (not removed; do not
                       describe it as decommissioned).
Worker source:       commit 60b415f ("RADIO: enforce cross-origin package
                       access at the Worker")
package source:      public/radio/**            (source, committed)
built static assets: dist/client/radio/**        (build output)
CORS response rule:  worker/index.ts             (source, committed — see below)
```

**Production RADIO CORS is resolved and verified**, directly against the
real domain (not just the temporary `*.workers.dev` URL used to validate
the Worker build before this routing was in place):

- Application: `200`.
- Manifest GET and HEAD: `200`, with `Access-Control-Allow-Origin: *` and
  `Access-Control-Allow-Methods: GET, HEAD` present.
- Manifest content: sha256
  `e5ea21b0bc61a03e6af110f77afed80a9ff327161d7f7382deeda0bd48ae6d27` —
  unchanged from the known immutable package.
- `audio/rtrack_000019-v1.opus`: `200`, same CORS headers present, byte size
  `2152787`, sha256
  `6cbde8063f02ac01d2c72a00b2b610211ba4177fa26927087c2bcd2b81ed8086` —
  unchanged.

`studiorich-orbital` is a Next.js app (via `vinext`) deployed to Cloudflare
Workers. `public/radio/**` is served through Cloudflare's native Static
Assets feature (`env.ASSETS.fetch`), reached via `worker/index.ts`'s own
`fetch` handler, which intercepts `/radio/**` GET/HEAD requests, fetches
from `env.ASSETS`, and adds `Access-Control-Allow-Origin: */
Access-Control-Allow-Methods: GET, HEAD` before returning — the same
pattern this Worker already used for `/_vinext/image`.

**`public/_headers` (the Cloudflare Pages/Workers-Assets convention) remains
committed but is NOT the active CORS mechanism** — it was never observed
honored by OpenAI Sites' own hosting during earlier troubleshooting, which
is what led to the Worker-level fix above. It's left in place (harmless);
the real, verified mechanism is the Worker-level header injection.

**Known discrepancy, recorded rather than silently resolved**: at the time
of this update, this repository's own `dig +short studiorich.tv NS` still
returned Porkbun's nameservers, not Cloudflare's, even though the
functional Cloudflare-proxied routing above is independently verified
working. Possible explanations (not confirmed either way from here):
NS-record TTL/caching lag at the resolver used for this check, or a
registrar-level DNS-hosting arrangement where Porkbun's NS remain
publicly listed while Cloudflare manages records behind them. Whoever next
touches DNS for this domain should reconcile this directly in each
provider's own dashboard rather than assume either account's UI is stale.

## RADIO Firestore rules — RADIO-04/04D deployed and human-accepted

**Deployed and verified**, 2026-09-30. RADIO-04 introduced the
`radioScheduleBlocks` collection's Firestore rule and RADIO-04D introduced
`radioChannels`' status-aware `programIds` conditional; both shipped as
source-only for several batches (RADIO-04 through RADIO-04D's own
completion reports explicitly flagged this and withheld deployment
pending human authorization). Verified independently, read-only, by
fetching the actual deployed ruleset for `studiorich-83b1e` via the
Firebase Rules API (no `firebase deploy` run to check this) and diffing
it byte-for-byte against source `firestore.rules`: the deployed ruleset
now matches source exactly (`projects/studiorich-83b1e/rulesets/
7b4ccd19-8a1c-4fb1-984b-9052e4157642`, superseding the prior
`54b3aa50-...` ruleset that predated both changes).

**Human acceptance evidence** (RADIO-04E authorization, 2026-09-30):
- A new inactive Channel (`Sleepy Time`, empty rotation) was created
  through RADIO → Programming's own "+" affordance and appeared correctly
  in the Channel selector — confirms `radioChannels`' RADIO-04D rule is
  live.
- Scheduling a published Playlist (`β0.1.3`) against it succeeded, and the
  resulting 6:00–8:00 AM block rendered on the weekly grid and opened its
  own Scheduled Program detail on click — confirms `radioScheduleBlocks`'
  create/read rules are live and the operator-authorization boundary
  works end to end for a real signed-in operator.
- Rename / Activate / Delete controls (RADIO-04E) were present in the same
  session; their own behavior is recorded as a separate open follow-up
  below, not yet individually human-verified.

**Recorded follow-ups (not fixed in this pass, tracked here rather than
re-discovered later):**
1. The Channel `•••` menu popover can clip against the right viewport
   edge depending on Channel-selector width/position.
2. Scheduling a Playlist that already has multiple legacy duplicate
   `radprogram_...` Program documents (pre-RADIO-03 duplication) surfaces
   all of them to the operator as an opaque ambiguous-Program-id choice
   (`radioProgramLifecycle.ts`'s existing `planProgramLifecycleAction`
   "ambiguous" path, RadioScheduleBlockDialog.tsx's own picker). The
   normal operator workflow should eventually resolve/reuse the correct
   Program automatically rather than requiring a choice among internal
   ids — not addressed in RADIO-04/04B/04D/04E.
3. RADIO-04E's Rename, Activate/Deactivate, and Delete behaviors
   specifically still need their own dedicated human verification pass
   (distinct from the scheduling-workflow evidence recorded above).
4. MEMBER/avatar presentation (RADIO-04E Part F recon) remains future
   integration work — not implemented, not scheduled.

## Deployment procedure

### Current production routing (resolved)

```
commit/push source (git push to studiorich-orbital's origin/main)
        ↓
Cloudflare Worker route radio.studiorich.tv/* → studiorich-orbital
        ↓
Worker's own fetch handler (worker/index.ts) serves /radio/** via
env.ASSETS.fetch, adding CORS headers, with OpenAI Sites remaining
the origin behind this route
        ↓
verify production directly (curl/browser) — do not assume
```

`radio.studiorich.tv` now resolves through a Cloudflare Worker route
executing `studiorich-orbital` directly (commit `60b415f`) — this is the
same Worker/build validated at the temporary `*.workers.dev` URL below
before this routing was put in place. **OpenAI Sites has not been removed
or decommissioned** — it remains the origin behind this route; do not
describe it as replaced without independently confirming that in a future
pass.

### Validation path used to prove the Worker build (historical, not the current routing mechanism)

```
npm run build   (or: npx vinext build && bash scripts/validate-artifact.sh,
                 if the wrapper's GNU `timeout` dependency isn't installed)
        ↓
npx wrangler deploy --config dist/server/wrangler.json
        ↓
publishes to https://studiorich-orbital.richardjlau.workers.dev
        ↓
verify directly (curl/browser)
```

This is how the Worker build (including the `/radio/**` CORS fix) was
proven correct — deployed and verified against the temporary `*.workers.dev`
URL, independent of `radio.studiorich.tv` — before the Cloudflare Worker
route for the real domain was established. Requires `npx wrangler whoami`
to show an authenticated account with Workers write permission.

### CORS deployment checkpoint (resolved)

```
GitHub source commit (public/_headers attempt, never honored in production): 57ddaeb
GitHub source commit (Worker-level CORS fix, now live in production):         60b415f
```

The `_headers`-based attempt (`57ddaeb`) was never observed honored in
production despite a reported OpenAI Sites deploy — this is what led to the
Worker-level fix. `60b415f` is now the live, verified production mechanism
for `/radio/**` CORS on `radio.studiorich.tv` itself (not just the
`*.workers.dev` validation URL) — see the verification evidence above.
This closes the corresponding DEBT.md item.

## Worktree distinction

```
current beta development:  /Users/studio/Projects/wall-of-sound-beta01
older/main checkout:       /Users/studio/Projects/wall-of-sound
```

These are two separate git worktrees of the same repository, on different
branches, and **can drift arbitrarily far apart** — the main checkout has,
at times, predated the entire RADIO Channel/Program/operator-identity work
that only exists on the beta branch. A dev server started from the wrong
worktree's `music/` directory will silently run different code with no
obvious signal beyond the URL/PID of the running process.

**Always explicitly `cd` to the intended worktree before running any
command** — do not assume the shell's current directory, and do not assume
a running dev server on a familiar-looking port is running the code you
think it is. Confirm via `pwd`, `git status`, and `git log -1` before trusting
a running server's origin.
