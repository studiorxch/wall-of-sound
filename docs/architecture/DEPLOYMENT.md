# StudioRich Deployment Facts

Verified current facts, especially for RADIO. See [README.md](README.md) for
what "current" means here — this file should be corrected in place, not
appended to, whenever a fact here changes.

## RADIO public hosting

```
domain:              radio.studiorich.tv
source repository:   studiorich-orbital  (separate git repo, NOT this one)
source branch:        main
hosting:             OpenAI Sites
package source:      public/radio/**            (source, committed)
built static assets: dist/client/radio/**        (build output)
static response rules: public/_headers           (source, committed)
```

`studiorich-orbital` is a Next.js app (via `vinext`) deployed to Cloudflare
Workers, using Cloudflare's native Static Assets feature to serve
`public/radio/**` — not a dynamic route, no Worker code involved in serving
those files. `public/_headers` (the Cloudflare Pages/Workers-Assets
convention) is honored **locally** (confirmed via `wrangler dev`), but as of
the most recent verification, production was **not yet honoring it** even
after a reported deploy — see the CORS checkpoint below and DEBT.md.

## Deployment procedure

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
after being told a deploy completed.

### Current CORS deployment checkpoint

These are **not** permanent architectural identifiers — they are the
specific commits involved in the most recent verified deployment attempt,
recorded here only so a future check can confirm whether production has
moved past this point:

```
GitHub source commit:            57ddaeb
OpenAI Sites deployed-source commit: 4d654ee
```

As of the most recent direct production check against these commits,
`public/_headers`' rules (both the new `/radio/*` CORS rule and the
pre-existing `/assets/*` immutable-cache rule) were **not yet observed live**
on `radio.studiorich.tv`, despite the reported deploy. See DEBT.md for the
open item this leaves.

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
