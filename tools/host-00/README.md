# HOST-00 isolated browser feasibility harness

Development experiment only. This is not HOME, a new RADIO implementation, or
an application route change. Uses the existing Vite dependency without loading
`music/vite.config.ts`, environment files, Firebase, or production data.

From repository root:

```sh
node tools/host-00/server.mjs
```

Open `http://127.0.0.1:5199/wall-app/` in a real browser. The harness server alone
serves the parent document at `/wall-app/` and `/blackbook.html`, and the child
at `/surface.html`. This is explicit local request routing, not proof that the
production server already serves HOME at those paths. The generated local WAV
is a 120-second, low-amplitude 220 Hz tone; no music/library data is read.

Click ON inside the child. The click synchronously calls the parent's activation
method, which constructs and primes the **existing** DualDeckPlaybackEngine.
The slow button waits six seconds only AFTER the synchronous activation/prime.
The harness observes both audio-object references, media events, currentTime,
AudioContext state, existing engine readiness, and an analyser attached to the
existing gain node. It uses TS-private properties for test instrumentation only;
no production engine change is required. OFF destroys the engine.

MAP/BLACKBOOK buttons push parent history and replace the child document.
Artwork A/B replace parent state. Diagnostic buttons deliberately exercise
unsafe alternatives: iframe.src, ordinary child links, child location.replace,
and child-only artwork replaceState. Do not treat these diagnostic actions as
recommended navigation. Browser Back/Forward, reload, the new-tab link, and the
input/Tab sequence must be exercised through browser controls/input.

Snapshots append to `/tmp/host-00-browser-evidence.ndjson`. Do not commit raw
runtime logs or generated WAV/cache files. The committed findings document
contains the durable observations, exact session identifiers, and evidence hash.
Preserve the raw file locally when restarting the server; it appends, not truncates.

```sh
node tools/host-00/verify-evidence.mjs /tmp/host-00-browser-evidence.ndjson
```

This validates recorded observations, not autoplay through simulation. The
optional `run-chromium.mjs` was preserved from the initial attempt: its fresh
headed browser launch stalled and was interrupted, so it is **not validated**
and supplies no acceptance evidence. Successful evidence came from native CUA
browser input in the existing Chrome profile. No autoplay bypass was requested.

The server binds loopback port 5199 only; stop with Ctrl-C. The harness is
intentionally removable as one directory. Do not add it to the production build.

See [HOST-00 findings](../../docs/architecture/proposals/HOST_00_FINDINGS.md).
