# wall-of-sound — working instructions

## Completion reports are mandatory, not optional

After finishing **any** spec/build task in the `music/` app (or any WOS project tracked under `WOS-share/`), write a completion report **before ending the turn** — do not batch this for later, do not wait to be asked.

Steps, every time:

1. Finish the build (typecheck, tests, live verification as applicable).
2. Write a completion report to `WOS-share/MUSIC/REPORTS/` following the template and filename convention in `WOS-share/Knowledge/Operations/Sync Instructions/Claude Spec Completion Report Prompt.md`.
3. Update `WOS-share/MUSIC/CURRENT/MUSIC_BUILD_STATUS.md` (Active/Completed/Deferred sections) and `MUSIC_CURRENT.md` (Last Completed Build).
4. If this is the last build of the day/session, also write or update the daily rollup in `WOS-share/MUSIC/REPORTS/rollups/`.

**Build ID convention:** `MMDDX` where `MMDD` is the date and `X` is a letter for same-day ordering (e.g. `0712A`, `0712B`). Match this to the spec's own filename/Document ID inside the report body for traceability.

Do not skip this because the build "felt small" (a hotfix or one-file patch still gets a report) or because multiple specs shipped in one session (each gets its own report — see step 4 for the rollup, which aggregates but does not replace individual reports).

If you realize partway through a session that reports were missed for earlier work, stop and backfill them before continuing — do not let the gap grow.
