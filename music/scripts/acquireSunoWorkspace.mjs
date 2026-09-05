#!/usr/bin/env node
/**
 * MUSIC — Suno Workspace Acquisition Driver (0905, "eliminate the manual
 * DevTools capture step")
 *
 * Automates exactly the manual step this project has been doing by hand:
 *   Suno workspace URL
 *   -> authenticated Chrome session (the user's own, already logged in)
 *   -> observe the real workspace/feed responses Suno naturally loads
 *   -> continue until a genuine has_more:false
 *   -> preserve the literal JSON response bodies
 *   -> hand those captures to the EXISTING, unmodified collector/merge
 *      pipeline (scripts/mergeSunoWorkspaceCollection.mjs, which in turn
 *      is a plain-JS port of collectSunoWorkspaceFromCaptures() in
 *      src/logic/sunoImport/sunoWorkspaceFeed.ts).
 *
 * This script does NOT re-implement pagination/dedupe/classification
 * logic — it only captures raw bodies and pagination metadata, then
 * shells out to the existing merge script exactly as if a human had
 * copy-pasted the same bodies out of DevTools. Nothing about the
 * archive schema, the never-downgrade merge, or the classification
 * rules changes.
 *
 * Auth model — Chrome remains the sole authentication authority:
 *   - This script NEVER reads cookies, Authorization headers, or any
 *     other credential. It attaches to an already-running, already
 *     logged-in Chrome via the Chrome DevTools Protocol and only reads
 *     RESPONSE BODIES (via response.json()) plus the outgoing request's
 *     own POST body (via request.postDataJSON(), which is the plain
 *     {cursor, limit, filters} payload the app itself sends — never a
 *     header).
 *   - It never launches its own Chromium, never stores a session, and
 *     never replays credentials anywhere.
 *
 * One-time setup (each time you restart Chrome):
 *   1. Fully quit Chrome.
 *   2. Relaunch it with remote debugging enabled:
 *        macOS:  open -a "Google Chrome" --args --remote-debugging-port=9222
 *   3. Log into suno.com normally in that window, exactly as always.
 *   4. Leave that window open. Run this script from a terminal.
 *
 * Usage:
 *   node scripts/acquireSunoWorkspace.mjs <workspace-url-or-id> [<url2> ...]
 *   node scripts/acquireSunoWorkspace.mjs --manifest <path-to-file>
 *     (manifest: one workspace URL or id per line; '#'-prefixed lines and
 *     blank lines are ignored; processed strictly one at a time — no
 *     concurrency)
 *
 * Env:
 *   SUNO_CDP_ENDPOINT   CDP endpoint to attach to (default http://localhost:9222)
 *
 * Output:
 *   - One capture-wrapper JSON per workspace, written to
 *     WOS-share/SUNO_LIBRARY/WORKSPACE_RECON/auto/<slug>.json — the exact
 *     same shape a manually-built wrapper has (see
 *     scripts/mergeSunoWorkspaceCollection.mjs's own header comment).
 *   - That wrapper is then fed straight into the existing merge script,
 *     whose own PER-WORKSPACE RESULTS / BATCH SUMMARY output (unmodified)
 *     is printed as the final report.
 *
 * Fails safely: any unauthenticated session, unexpected response shape,
 * broken cursor chain, cross-workspace leakage, stalled/duplicate page,
 * or unreachable has_more:false stops that workspace and reports
 * FAIL/PARTIAL. It never silently accepts an incomplete workspace, and
 * never fabricates a missing page.
 */

import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MUSIC_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(MUSIC_ROOT, "..");
const AUTO_CAPTURE_DIR = join(REPO_ROOT, "WOS-share", "SUNO_LIBRARY", "WORKSPACE_RECON", "auto");
const MERGE_SCRIPT = join(__dirname, "mergeSunoWorkspaceCollection.mjs");

const CDP_ENDPOINT = process.env.SUNO_CDP_ENDPOINT || "http://localhost:9222";
const MAX_CONTINUATIONS = 50;
const MAX_DURATION_MS = 5 * 60 * 1000;
const INITIAL_LOAD_TIMEOUT_MS = 20_000;
const CONTINUATION_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 500;
// Suno fires GET /api/project and a redundant POST /api/feed/v3 with
// cursor:null "in parallel" on initial load. If only one has resolved by
// the time the initial waitForCondition below is satisfied, give the
// other a brief window to arrive too, so the live loop's "prefer a real
// feed bootstrap over a project-derived one" choice doesn't depend on
// which of the two happened to settle first.
const BOOTSTRAP_SETTLE_MS = 2_000;

// ---------------------------------------------------------------------
// Pure helpers — duplicated in plain JS from
// src/logic/sunoImport/sunoWorkspaceAcquisition.ts (same tradeoff
// mergeSunoWorkspaceCollection.mjs already made relative to
// sunoWorkspaceFeed.ts, so this can run standalone via `node`). Keep the
// two in sync; see that file's test suite for coverage of this logic.
// ---------------------------------------------------------------------
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function parseSunoWorkspaceId(input) {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const wid = url.searchParams.get("wid") ?? url.searchParams.get("wId") ?? url.searchParams.get("workspaceId");
    if (wid && UUID_RE.test(wid)) return wid.match(UUID_RE)[0];
  } catch {
    // not a URL — fall through
  }
  const m = trimmed.match(UUID_RE);
  if (m) return m[0];
  throw new Error(`Could not find a workspace id in: ${input}`);
}

// Matches GET /api/project/{workspaceId} ONLY — deliberately excludes
// sibling paths like /api/project/{workspaceId}/pinned-clips, which a
// live capture showed firing on the same page load with a mostly-empty
// body that raced with (and once beat) the real response.
function isSunoProjectRequestUrl(url) {
  return /\/api\/project\/[0-9a-f-]{36}(?:\?.*)?$/i.test(url);
}

function isSunoFeedV3RequestUrl(url) {
  return /\/api\/feed\/v3(?:[/?].*)?$/i.test(url);
}

function decideNextAction(pages, elapsedMs, limits) {
  if (pages.length === 0) return { action: "continue" };
  const last = pages[pages.length - 1];
  if (!Array.isArray(last.response?.clips) || typeof last.response?.has_more !== "boolean") {
    return { action: "abort", reason: "Last captured response has an unexpected shape (missing clips[] or has_more)" };
  }
  if (last.response.has_more === false) return { action: "stop", reason: "terminal" };
  if (pages.length - 1 >= limits.maxContinuations) {
    return { action: "abort", reason: `Exceeded safety cap of ${limits.maxContinuations} continuation calls without reaching has_more:false` };
  }
  if (elapsedMs >= limits.maxDurationMs) {
    return { action: "abort", reason: `Exceeded time budget of ${limits.maxDurationMs}ms without reaching has_more:false` };
  }
  return { action: "continue" };
}

// Decides continuation before any real feed page has been captured yet.
// Fails loudly (abort) rather than silently defaulting to "done" when the
// captured /api/project response is missing the fields this depends on —
// a live capture (0905, Tron Arc 2.0) showed a misidentified sibling
// endpoint (/pinned-clips) with absent clip_count/project_clips silently
// evaluating to 0 > 0 = false and cutting acquisition short after 1 page.
function decideInitialContinuation(projectResponse, feedPagesLength) {
  if (feedPagesLength > 0) return { action: "continue" };
  if (projectResponse == null) return { action: "continue" };
  if (typeof projectResponse.clip_count !== "number" || !Array.isArray(projectResponse.project_clips)) {
    return {
      action: "abort",
      reason: "Captured /api/project response is missing clip_count or project_clips — possibly a misidentified endpoint",
    };
  }
  return { action: projectResponse.clip_count > projectResponse.project_clips.length ? "continue" : "stop" };
}

// Decides whether ONE captured /api/feed/v3 response is the specific page
// the driver is currently waiting for, given its own outgoing request's
// cursor. Core race fix (0905, second pass): pagination advances by a
// matched request/response pair — the cursor the app itself sent, echoed
// back in the request body Playwright observed — never by "whichever
// response was captured most recently."
//
// expected: {kind:"awaiting-bootstrap"} | {kind:"pending",cursor} | {kind:"terminal"}
// Returns: {matched:false} | {matched:true,valid:false,reason} | {matched:true,valid:true,next}
function matchFeedResponseToExpectedCursor(expected, cursorUsed, response) {
  if (expected.kind === "terminal") return { matched: false };
  const wanted = expected.kind === "awaiting-bootstrap" ? null : expected.cursor;
  if (cursorUsed !== wanted) return { matched: false };

  if (!Array.isArray(response?.clips) || typeof response?.has_more !== "boolean") {
    return {
      matched: true,
      valid: false,
      reason: `Matched feed/v3 response (cursor=${cursorUsed}) has an unexpected shape (missing clips[] or has_more)`,
    };
  }
  if (response.has_more === false) return { matched: true, valid: true, next: { kind: "terminal" } };

  const clips = response.clips;
  if (clips.length === 0) {
    return {
      matched: true,
      valid: false,
      reason: `Matched feed/v3 response (cursor=${cursorUsed}) has has_more:true but zero clips — cannot derive the next cursor`,
    };
  }
  const lastId = clips[clips.length - 1]?.id;
  if (typeof lastId !== "string") {
    return {
      matched: true,
      valid: false,
      reason: `Matched feed/v3 response (cursor=${cursorUsed}) has has_more:true but its last clip has no usable id to derive the next cursor`,
    };
  }
  return { matched: true, valid: true, next: { kind: "pending", cursor: lastId } };
}

// Establishes the pagination state to continue from when NO genuine
// cursor:null feed bootstrap was captured — only a raw /api/project
// response. Reuses decideInitialContinuation (unchanged) for the
// continue/stop/abort call, then derives the cursor a continuation call
// must echo from the project response's own last clip.
function deriveInitialExpectedCursor(projectResponse) {
  const initial = decideInitialContinuation(projectResponse, 0);
  if (initial.action === "abort") return { ok: false, reason: initial.reason };
  if (initial.action === "stop") return { ok: true, expected: { kind: "terminal" } };

  const clips = projectResponse.project_clips ?? [];
  const lastId = clips.length > 0 ? clips[clips.length - 1]?.clip?.id : undefined;
  if (typeof lastId !== "string") {
    return {
      ok: false,
      reason: "Captured /api/project response's clips are missing usable id fields — cannot derive next cursor",
    };
  }
  return { ok: true, expected: { kind: "pending", cursor: lastId } };
}

function detectObviousStall(pages) {
  if (pages.length < 2) return null;
  const prev = pages[pages.length - 2];
  const curr = pages[pages.length - 1];
  if (prev.cursorUsed != null && curr.cursorUsed != null && prev.cursorUsed === curr.cursorUsed) {
    return `Same cursor (${curr.cursorUsed}) used on consecutive captured pages — likely a stalled/duplicate capture`;
  }
  const prevClips = prev.response?.clips;
  const currClips = curr.response?.clips;
  if (prevClips?.length && currClips?.length && prevClips[0]?.id === currClips[0]?.id) {
    return `Consecutive captured pages share the same first clip id (${currClips[0]?.id}) — likely a duplicate capture`;
  }
  return null;
}

// Always assemble a FEED-ONLY capture list, discarding GET
// /api/project/{wid} as an authority even when one was captured. Two
// things observed live (0905, Tron Arc 2.0) justify this:
//   1. Suno's workspace UI fires a redundant POST /api/feed/v3 with
//      cursor:null in parallel with GET /api/project/{wid} on initial
//      load, returning the identical first-page clips a second time.
//      If it fires, that captured feed page IS the real feed-only
//      bootstrap page — nothing needs to be synthesized.
//   2. /api/project's own `clip_count` field has been directly
//      observed to be stale by exactly one clip relative to what
//      pagination actually returns before a genuine has_more:false.
//      Every successful real-world ingestion in this project (40+
//      workspaces, prior to this automation existing) used the
//      feed-only capture shape for exactly this reason — its pass
//      criterion depends only on reaching a genuine has_more:false,
//      not on cross-checking Suno's own count metadata.
// If no genuine null-cursor feed page was captured, one is synthesized
// from the literal, verbatim project_clips[].clip entries — no clip
// data is fabricated, only the {clips, has_more} envelope is
// reconstructed around real clips. Its has_more guess is never
// load-bearing: the collector's own has_more/zero-clips checks fail
// safely if that guess is wrong.
function toFeedOnlyCaptures(projectResponse, feedPages) {
  const hasBootstrap = feedPages.some((p) => p.cursorUsed == null);
  if (hasBootstrap) {
    let seenBootstrap = false;
    return feedPages.filter((p) => {
      if (p.cursorUsed != null) return true;
      if (seenBootstrap) return false;
      seenBootstrap = true;
      return true;
    });
  }
  const clips = projectResponse?.project_clips?.map((pc) => pc.clip) ?? [];
  if (clips.length === 0) return feedPages;
  const hasMoreGuess = typeof projectResponse?.clip_count === "number" ? projectResponse.clip_count > clips.length : feedPages.length > 0;
  return [{ cursorUsed: null, response: { clips, has_more: hasMoreGuess } }, ...feedPages];
}

function buildCaptureWrapper(bundle) {
  const feedPages = toFeedOnlyCaptures(bundle.projectResponse, bundle.feedPages);
  return {
    workspaceId: bundle.workspaceId,
    workspaceName: bundle.workspaceName,
    projectResponse: null,
    feedResponses: feedPages.map((p) => ({ cursor: p.cursorUsed, response: p.response })),
    provenanceConfirmed: bundle.provenanceConfirmed,
  };
}

function slugifyWorkspaceName(name, fallbackId) {
  const base = (name ?? fallbackId)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || fallbackId;
}

// ---------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForCondition(predicate, timeoutMs, label) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${label}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function triggerScroll(page) {
  // Best-effort generic infinite-scroll nudge. Correctness never depends
  // on this hitting the right element — it only needs to provoke
  // Suno's own next fetch; the network capture above is what actually
  // validates progress. If nothing loads, waitForCondition below times
  // out and that workspace is reported FAIL rather than silently
  // accepted as complete.
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    document.querySelectorAll("main, [role='main'], [class*='scroll' i]").forEach((el) => {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });
  });
  await page.mouse.wheel(0, 2400);
}

async function acquireOneWorkspace(browser, target) {
  const workspaceId = parseSunoWorkspaceId(target);
  const workspaceUrl = target.includes("://") ? target : `https://suno.com/create?wid=${workspaceId}`;

  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("No existing browser context found over CDP — is Chrome actually open and logged in?");
  }
  const page = await context.newPage();

  let projectResponse = null;
  let workspaceName;
  const feedPages = []; // logical, cursor-validated sequence only — becomes capture.feedPages
  const rawFeedCaptures = []; // every /api/feed/v3 response observed, unfiltered — diagnostics only
  const anomalies = [];
  const debug = !!process.env.SUNO_ACQUIRE_DEBUG;
  const debugStart = Date.now();
  const log = (...args) => {
    if (debug) console.error(`[debug ${Date.now() - debugStart}ms]`, ...args);
  };

  let expectedCursor = { kind: "awaiting-bootstrap" };
  let terminalObserved = false;

  page.on("response", (response) => {
    const req = response.request();
    const url = response.url();
    if (req.method() === "GET" && isSunoProjectRequestUrl(url)) {
      if (!url.includes(workspaceId)) return; // a different workspace's project call sharing this tab
      log("GET /api/project response event fired", url);
      response
        .json()
        .then((body) => {
          projectResponse = body;
          workspaceName = body?.name;
          log("GET /api/project body parsed", {
            clip_count: body?.clip_count,
            project_clips_len: body?.project_clips?.length,
          });
        })
        .catch((err) => anomalies.push(`Failed to parse /api/project response body: ${err.message}`));
    } else if (req.method() === "POST" && isSunoFeedV3RequestUrl(url)) {
      let cursorUsed = null;
      let postData = null;
      try {
        postData = req.postDataJSON();
      } catch {
        // no JSON body — leave cursorUsed as null, not fatal on its own
      }
      const requestWorkspaceId = postData?.filters?.workspace?.workspaceId;
      if (requestWorkspaceId && requestWorkspaceId !== workspaceId) return; // different workspace's feed call
      cursorUsed = postData?.cursor ?? null;
      log("POST /api/feed/v3 response event fired", { cursorUsed, expectedCursor });
      response
        .json()
        .then((body) => {
          rawFeedCaptures.push({ cursorUsed, response: body });
          log("POST /api/feed/v3 body parsed", {
            cursorUsed,
            has_more: body?.has_more,
            clips_len: body?.clips?.length,
            first_id: body?.clips?.[0]?.id,
            last_id: body?.clips?.[body?.clips?.length - 1]?.id,
          });

          const result = matchFeedResponseToExpectedCursor(expectedCursor, cursorUsed, body);
          if (!result.matched) {
            log("IGNORED — cursor does not match what the driver is currently waiting for", {
              cursorUsed,
              expectedCursor,
            });
            return;
          }
          if (!result.valid) {
            anomalies.push(result.reason);
            return;
          }
          feedPages.push({ cursorUsed, response: body });
          expectedCursor = result.next;
          if (expectedCursor.kind === "terminal") terminalObserved = true;
          log("ACCEPTED into logical sequence", { index: feedPages.length - 1, nextExpectedCursor: expectedCursor });
        })
        .catch((err) => anomalies.push(`Failed to parse /api/feed/v3 response body: ${err.message}`));
    }
  });

  await page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

  await waitForCondition(
    () => projectResponse != null || feedPages.length > 0 || anomalies.length > 0,
    INITIAL_LOAD_TIMEOUT_MS,
    "the first /api/project or /api/feed/v3 response",
  );
  if (anomalies.length > 0) {
    await page.close();
    throw new Error(anomalies[0]);
  }

  // Suno fires GET /api/project and a redundant cursor:null POST
  // /api/feed/v3 in parallel — give whichever hasn't resolved yet a brief
  // window, so a genuine feed bootstrap arriving a beat late still wins
  // over falling back to the project response.
  if (feedPages.length === 0) {
    await sleep(BOOTSTRAP_SETTLE_MS);
  }

  if (feedPages.length === 0 && expectedCursor.kind === "awaiting-bootstrap") {
    // No genuine cursor:null feed bootstrap arrived. The initial
    // waitForCondition guarantees projectResponse != null here (it's the
    // only other way that condition could have been satisfied).
    const derived = deriveInitialExpectedCursor(projectResponse);
    if (!derived.ok) {
      await page.close();
      throw new Error(derived.reason);
    }
    expectedCursor = derived.expected;
    if (expectedCursor.kind === "terminal") terminalObserved = true;
    log("Derived initial expected cursor from /api/project (no feed bootstrap arrived)", { expectedCursor });
  }

  const startedAt = Date.now();
  while (expectedCursor.kind !== "terminal") {
    const elapsedMs = Date.now() - startedAt;
    const decision = decideNextAction(feedPages, elapsedMs, {
      maxContinuations: MAX_CONTINUATIONS,
      maxDurationMs: MAX_DURATION_MS,
    });
    if (decision.action === "stop") break; // redundant with expectedCursor reaching "terminal"; kept as a safety net
    if (decision.action === "abort") {
      await page.close();
      throw new Error(decision.reason);
    }
    if (feedPages.length === 0 && elapsedMs >= MAX_DURATION_MS) {
      await page.close();
      throw new Error("Exceeded time budget waiting for the first continuation page");
    }

    const stall = detectObviousStall(feedPages);
    if (stall) {
      await page.close();
      throw new Error(stall);
    }

    const pendingCursor = expectedCursor;
    await triggerScroll(page);
    try {
      await waitForCondition(
        () => expectedCursor !== pendingCursor || anomalies.length > 0,
        CONTINUATION_TIMEOUT_MS,
        `a feed/v3 response matching cursor=${pendingCursor.kind === "pending" ? pendingCursor.cursor : "null (bootstrap)"}`,
      );
    } catch (err) {
      await page.close();
      throw new Error(`Pagination stalled — no feed/v3 response matched the expected cursor: ${err.message}`);
    }
    if (anomalies.length > 0) {
      await page.close();
      throw new Error(anomalies[0]);
    }
  }

  await page.close();

  if (!terminalObserved) {
    // Structurally shouldn't happen — the loop only exits once
    // expectedCursor reaches "terminal" — but fail loudly rather than
    // silently accepting an incomplete workspace if it ever does.
    throw new Error("Acquisition loop exited without observing a terminal has_more:false — refusing to report success");
  }

  return {
    workspaceId,
    workspaceName,
    projectResponse,
    feedPages,
    provenanceConfirmed: true, // every captured request's URL was directly observed via page.on("response")
    rawFeedCaptureCount: rawFeedCaptures.length,
  };
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node scripts/acquireSunoWorkspace.mjs <workspace-url-or-id> [<url2> ...]");
    console.error("   or: node scripts/acquireSunoWorkspace.mjs --manifest <path-to-file>");
    process.exit(1);
  }

  let targets;
  if (args[0] === "--manifest") {
    const manifestPath = args[1];
    if (!manifestPath) {
      console.error("--manifest requires a file path");
      process.exit(1);
    }
    targets = readFileSync(manifestPath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } else {
    targets = args;
  }

  console.log(`Connecting to Chrome over CDP at ${CDP_ENDPOINT} ...`);
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  } catch (err) {
    console.error(`FAIL: could not connect to Chrome over CDP at ${CDP_ENDPOINT}.`);
    console.error(`Quit Chrome completely, then relaunch it with:`);
    console.error(`  open -a "Google Chrome" --args --remote-debugging-port=9222`);
    console.error(`Log into suno.com normally in that window, then re-run this script.`);
    console.error(String(err?.message ?? err));
    process.exit(1);
  }

  mkdirSync(AUTO_CAPTURE_DIR, { recursive: true });

  let overallExitCode = 0;
  for (const target of targets) {
    console.log(`\n=== Acquiring: ${target} ===`);
    let capture;
    try {
      capture = await acquireOneWorkspace(browser, target);
    } catch (err) {
      console.error(`FAIL (${target}): ${err?.message ?? err}`);
      overallExitCode = 1;
      continue;
    }

    const pageCount = capture.feedPages.length + (capture.projectResponse ? 1 : 0);
    const terminalHasMore =
      capture.feedPages.length > 0
        ? capture.feedPages[capture.feedPages.length - 1].response.has_more
        : false;
    console.log(
      `Acquisition PASS: ${pageCount} page(s) captured` +
        (capture.projectResponse ? " (1 project + " + capture.feedPages.length + " feed)" : " (feed-only)") +
        `, terminal has_more=${terminalHasMore}` +
        (capture.rawFeedCaptureCount > capture.feedPages.length
          ? ` (${capture.rawFeedCaptureCount - capture.feedPages.length} raw feed/v3 response(s) observed but not matched to the logical sequence — see SUNO_ACQUIRE_DEBUG for detail)`
          : ""),
    );

    const wrapper = buildCaptureWrapper(capture);
    const slug = slugifyWorkspaceName(capture.workspaceName, capture.workspaceId);
    const wrapperPath = join(AUTO_CAPTURE_DIR, `${slug}.json`);
    writeFileSync(wrapperPath, JSON.stringify(wrapper, null, 2), "utf-8");
    console.log(`Wrote capture wrapper -> ${wrapperPath}`);

    console.log(`Running existing merge pipeline (scripts/mergeSunoWorkspaceCollection.mjs) ...`);
    const mergeResult = spawnSync(process.execPath, [MERGE_SCRIPT, wrapperPath], {
      encoding: "utf-8",
      cwd: MUSIC_ROOT,
    });
    process.stdout.write(mergeResult.stdout ?? "");
    process.stderr.write(mergeResult.stderr ?? "");
    if (mergeResult.status !== 0) {
      console.error(`FAIL (${target}): merge pipeline exited with status ${mergeResult.status}`);
      overallExitCode = 1;
      continue;
    }
    console.log(`PASS (${target})`);
  }

  // Deliberately do not call browser.close() — this connection was
  // attached to the user's own already-running Chrome; closing it here
  // must never close their browser or any of their other tabs. Letting
  // the Node process exit simply drops our CDP connection.
  process.exit(overallExitCode);
}

main();
