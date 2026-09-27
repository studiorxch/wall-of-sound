# StudioRich Canonical Architecture Registry

This directory describes **current architectural truth** — what is actually
true about this codebase right now. It is not a history of how anything got
built, and it is not a plan for what should get built next.

```
SPEC   = what should be built    (a batch brief, a feature spec)
REPORT = what happened           (a completion report for one batch)
STATE  = what is true now        (this directory)
```

A SPEC and a REPORT are both point-in-time documents about *how we got here*.
The files in `docs/architecture/` are the opposite: they are meant to be
overwritten in place whenever the truth they describe changes, so a reader
never has to reconstruct current state from a chain of historical batches.

## The permanent rule

**ARCHITECTURAL BOOKKEEPING IS PART OF IMPLEMENTATION.**

Any batch that changes one of the following must update the relevant file in
this directory in the *same commit* as the code change:

- system ownership
- canonical implementation
- runtime/data flow
- persistence authority
- identity relationships
- deployment procedure
- integration boundaries
- deprecation/replacement status
- known architectural debt

If a batch changes none of those, its completion report should say so
explicitly:

```
Architecture docs: no update required.
```

## The rule for future recon

**Read canonical architecture before performing broad recon.**

- If this directory and the current code agree, do not re-prove the
  architecture from git history or old reports — just use it.
- If they conflict, perform only enough targeted recon to resolve that
  specific discrepancy, then correct the canonical document.
- Historical investigation (git log, old WOS-share reports, superseded
  specs) is a last resort for establishing a *current-state* fact that
  cannot otherwise be confirmed from the code — never the default first
  step.

## What's in here

| File | Covers |
|---|---|
| [SYSTEMS.md](SYSTEMS.md) | The StudioRich system registry — MUSIC, RADIO, MAP/SUBWAY, MEMBER IDENTITY |
| [OWNERSHIP.md](OWNERSHIP.md) | Which system/module owns which responsibility, and canonical-vs-legacy status |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Verified deployment facts and procedure, especially RADIO |
| [DEBT.md](DEBT.md) | Actionable architectural debt, each with a revisit trigger |
| [radio/README.md](radio/README.md) | The one-page RADIO architecture map — read this before any RADIO batch |
| [admin/README.md](admin/README.md) | ADMIN control plane — its relationship to MEMBER, visibility-vs-authorization rule, current RADIO scope |

## Proposed architecture (not current-state truth)

The `proposals/` directory is an explicitly separate specification area.
Entries there must not be read as implemented architecture. Promote facts into
current-state pages only with their verified implementation checkpoints.

- [STUDIORICH HOME persistent host V1](proposals/HOME_PERSISTENT_HOST_V1.md) —
  proposed same-origin surface hosting, public URL/history contract, persistent
  RADIO session, browser validation gates, and staged migration. Not implemented.
