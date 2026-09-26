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
hosting (current production, as of this writing): OpenAI Sites
hosting (proven, not yet cut over): direct Cloudflare Workers deploy,
                       temporary URL https://studiorich-orbital.richardjlau.workers.dev
package source:      public/radio/**            (source, committed)
built static assets: dist/client/radio/**        (build output)
CORS response rule:  worker/index.ts             (source, committed — see below)
```

**Direct Cloudflare Workers deployment is now proven working**, independent
of OpenAI Sites. `npx wrangler deploy --config dist/server/wrangler.json`
(after `npm run build`) deploys the exact same source directly to Cloudflare
Workers' default `*.workers.dev` subdomain — no restructuring needed, no
custom domain/route attached by this deploy. This was verified end-to-end:
application loads, the Soft Motion Radio v1 manifest is present and
byte-identical (sha256-verified) to the known immutable package, and —
critically — the `/radio/**` CORS fix (`worker/index.ts`, commit `60b415f`)
**works correctly there immediately**, with `Access-Control-Allow-Origin: *`
and `Access-Control-Allow-Methods: GET, HEAD` present on manifest GET,
manifest HEAD, and a real `.opus` GET, all with an `Origin` header. This
confirms OpenAI Sites — not the code — was the actual blocker documented
below and in DEBT.md.

**OpenAI Sites remains current production** (`radio.studiorich.tv` is not
yet repointed) until an explicit, separately-approved custom-domain
cutover.

`studiorich-orbital` is a Next.js app (via `vinext`) deployed to Cloudflare
Workers. `public/radio/**` is served through Cloudflare's native Static
Assets feature (`env.ASSETS.fetch`), reached today via `worker/index.ts`'s
own `fetch` handler, which intercepts `/radio/**` GET/HEAD requests, fetches
from `env.ASSETS`, and adds `Access-Control-Allow-Origin: */
Access-Control-Allow-Methods: GET, HEAD` before returning — the same
pattern this Worker already used for `/_vinext/image`.

**`public/_headers` (the Cloudflare Pages/Workers-Assets convention) is
committed but NOT the active CORS mechanism.** It works correctly under
local `wrangler dev` (confirmed), but repeated direct production checks —
across multiple days, well past any reasonable deploy-propagation window —
showed production never honoring it (identical stale `ETag`, no
`access-control-*` header, and the pre-existing `/assets/*` immutable-cache
rule also unhonored). This project's actual OpenAI Sites hosting does not
appear to apply `_headers` the way plain Cloudflare Workers Static Assets
does. The file is left in place (harmless) but the real, verified mechanism
is the Worker-level header injection above.

## Deployment procedure

### Current production path (OpenAI Sites)

```
commit/push source (git push to studiorich-orbital's origin/main)
        ↓
open the existing OpenAI Site
        ↓
Edit
        ↓
Work — updates the existing Site from the committed source
        ↓
explicit build/deploy action
        ↓
verify production directly (curl/browser) — do not assume
```

**`git push` alone does NOT prove production deployment.** A push updates
the GitHub source; OpenAI Sites appears to require a separate, explicit
build/deploy step through its own UI before that source is actually served.
There is no CI/CD workflow, Sites CLI, or deploy script committed anywhere
in `studiorich-orbital` — no automated mechanism exists in this environment
to trigger or confirm a Sites deploy. The only way to know production has
actually changed is to check it directly (response headers, ETag, content)
after being told a deploy completed. This path has been unreliable in
practice — see DEBT.md.

### Proven alternative path (direct Cloudflare Workers)

```
npm run build   (or: npx vinext build && bash scripts/validate-artifact.sh,
                 if the wrapper's GNU `timeout` dependency isn't installed)
        ↓
npx wrangler deploy --config dist/server/wrangler.json
        ↓
publishes immediately to https://studiorich-orbital.richardjlau.workers.dev
        ↓
verify directly (curl/browser)
```

Requires `npx wrangler whoami` to show an authenticated account with
Workers write permission. No `account_id`, `routes`, or custom domain is
set in the generated `dist/server/wrangler.json` — a bare deploy publishes
only to the default `*.workers.dev` subdomain, never touching
`radio.studiorich.tv` or any DNS. Verified end-to-end working, including
the `/radio/**` CORS fix, on the first attempt — no propagation delay, no
missing-header mystery. **Cutting `radio.studiorich.tv` over to this path
requires a separate, explicit, approved custom-domain step — not yet
done.**

### Current CORS deployment checkpoint

These are **not** permanent architectural identifiers — they are the
specific commits involved in the most recent verified deployment attempt,
recorded here only so a future check can confirm whether production has
moved past this point:

```
GitHub source commit (public/_headers attempt):  57ddaeb
OpenAI Sites deployed-source commit (reported):    4d654ee
GitHub source commit (Worker-level CORS fix):     60b415f  ← pushed, NOT yet confirmed live
```

`_headers`-based CORS (`57ddaeb`/`4d654ee`) was never observed live in
production despite a reported deploy — this is what led to the Worker-level
fix above. `60b415f` (the Worker-level fix, adding CORS headers inside
`worker/index.ts`'s own `fetch` handler) has been pushed to `origin/main`
but, as of the last direct production check, production is still serving
the pre-fix build (identical `ETag` to before the push) — **push alone has
not yet resulted in a new deploy**. See DEBT.md for the open item this
leaves.

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
