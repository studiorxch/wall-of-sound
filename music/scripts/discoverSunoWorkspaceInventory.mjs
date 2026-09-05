#!/usr/bin/env node
/**
 * MUSIC — Suno Workspace Inventory Discovery (0905, "build the manifest
 * from the difference")
 *
 * This is a READ-ONLY reconnaissance step upstream of
 * scripts/acquireSunoWorkspace.mjs. It does NOT capture any workspace's
 * clips, does NOT touch the archive, and does NOT run the collector or
 * merge pipeline. It only answers: "of all workspaces that exist on this
 * Suno account, which ones does our archive not have yet?"
 *
 * Discovery authority: Suno's OWN authenticated "Workspaces" library page
 * (https://suno.com/me/workspaces), which lists every workspace the
 * account has via GET /api/project/me?page=N (20 per page). The archive
 * is used only to determine what's already captured — never as the
 * source of the full inventory, since a workspace that was never
 * captured at all would be invisible there.
 *
 * Auth model — identical to acquireSunoWorkspace.mjs: this script NEVER
 * reads cookies or Authorization headers. It attaches to an
 * already-running, already logged-in Chrome via CDP and only reads
 * response bodies the browser itself received after the driver triggers
 * the exact same UI action a human would (scrolling the workspaces list's
 * own scroll container to load the next page).
 *
 * Pagination is validated by the same race-fix principle just applied to
 * feed/v3: a captured page is only accepted into the logical sequence if
 * its own `page` query param matches the page number the driver is
 * currently expecting — never "whichever response arrived most
 * recently." `num_total_results` must stay constant across every
 * accepted page (a live account changing size mid-crawl is a real
 * anomaly, not something to silently paper over).
 *
 * Usage:
 *   node scripts/discoverSunoWorkspaceInventory.mjs
 *
 * Env:
 *   SUNO_CDP_ENDPOINT   CDP endpoint to attach to (default http://localhost:9222)
 *
 * Output:
 *   - WOS-share/SUNO_LIBRARY/WORKSPACE_RECON/discovered-workspace-inventory.json
 *     — the full raw discovered list (id, name, description, clip_count,
 *     last_updated_clip, shared, created_at), for reference.
 *   - WOS-share/SUNO_LIBRARY/WORKSPACE_RECON/remaining-workspaces.manifest.txt
 *     — ONLY the workspaces not yet represented in the archive, one
 *     https://suno.com/create?wid=<id> URL per line (with a preceding
 *     '#' comment naming the workspace), in the exact format
 *     acquireSunoWorkspace.mjs --manifest already expects. This file is
 *     a proposal for review — nothing reads or acts on it automatically.
 *   - A console summary: total discovered, already represented,
 *     remaining uncaptured, and anything that couldn't be resolved
 *     cleanly (e.g. Suno's non-UUID "default" unassigned-clips bucket,
 *     which isn't addressable via /create?wid=).
 *
 * Fails safely: an unauthenticated session, an unexpected response
 * shape, a page-number mismatch, a duplicate workspace id across pages,
 * or num_total_results changing mid-crawl stops the whole discovery run
 * rather than silently reporting a partial or inconsistent inventory.
 */

import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MUSIC_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(MUSIC_ROOT, "..");
const ARCHIVE_FILE = join(REPO_ROOT, "WOS-share", "SUNO_LIBRARY", "SUNO_METADATA_ARCHIVE", "archive.jsonl");
const WORKSPACE_RECON_DIR = join(REPO_ROOT, "WOS-share", "SUNO_LIBRARY", "WORKSPACE_RECON");
const INVENTORY_OUT = join(WORKSPACE_RECON_DIR, "discovered-workspace-inventory.json");
const MANIFEST_OUT = join(WORKSPACE_RECON_DIR, "remaining-workspaces.manifest.txt");

const CDP_ENDPOINT = process.env.SUNO_CDP_ENDPOINT || "http://localhost:9222";
const WORKSPACES_URL = "https://suno.com/me/workspaces";
const MAX_PAGES = 200; // safety cap — 264 known workspaces / 20 per page ~= 14 pages at time of writing
const INITIAL_LOAD_TIMEOUT_MS = 20_000;
const CONTINUATION_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isProjectListRequestUrl(url) {
  return /\/api\/project\/me(?:\?.*)?$/i.test(url) && !/\/api\/project\/me\//i.test(url);
}

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

async function scrollWorkspacesList(page) {
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("*"));
    all.forEach((el) => {
      const style = getComputedStyle(el);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 10) {
        el.scrollTop = el.scrollHeight;
      }
    });
    window.scrollTo(0, document.body.scrollHeight);
  });
}

async function discoverAllWorkspaces(browser) {
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("No existing browser context found over CDP — is Chrome actually open and logged in?");
  }
  const page = await context.newPage();

  const acceptedPages = []; // ordered, page-number-validated
  const anomalies = [];
  let expectedPage = 1;
  let numTotalResults = null;

  page.on("response", (response) => {
    const url = response.url();
    if (!isProjectListRequestUrl(url)) return;
    let requestedPage;
    try {
      requestedPage = Number(new URL(url).searchParams.get("page"));
    } catch {
      anomalies.push(`Could not parse page number from ${url}`);
      return;
    }
    response
      .json()
      .then((body) => {
        if (requestedPage !== expectedPage) return; // stale/out-of-order/duplicate — ignore, keep waiting
        if (!Array.isArray(body?.projects) || typeof body?.num_total_results !== "number") {
          anomalies.push(`Page ${requestedPage} response has an unexpected shape (missing projects[] or num_total_results)`);
          return;
        }
        if (numTotalResults == null) {
          numTotalResults = body.num_total_results;
        } else if (body.num_total_results !== numTotalResults) {
          anomalies.push(
            `num_total_results changed mid-crawl (page ${requestedPage}: ${body.num_total_results} vs earlier ${numTotalResults}) — account contents shifted during discovery, aborting rather than reporting an inconsistent inventory`,
          );
          return;
        }
        acceptedPages.push({ page: requestedPage, projects: body.projects });
        expectedPage += 1;
      })
      .catch((err) => anomalies.push(`Failed to parse page ${requestedPage} response body: ${err.message}`));
  });

  await page.goto(WORKSPACES_URL, { waitUntil: "domcontentloaded" });
  await waitForCondition(
    () => acceptedPages.length > 0 || anomalies.length > 0,
    INITIAL_LOAD_TIMEOUT_MS,
    "the first /api/project/me response",
  );
  if (anomalies.length > 0) {
    await page.close();
    throw new Error(anomalies[0]);
  }

  while (true) {
    const collectedSoFar = acceptedPages.reduce((n, p) => n + p.projects.length, 0);
    if (collectedSoFar >= numTotalResults) break;
    if (acceptedPages.length >= MAX_PAGES) {
      await page.close();
      throw new Error(`Exceeded safety cap of ${MAX_PAGES} pages without collecting all ${numTotalResults} workspaces`);
    }

    const beforeCount = acceptedPages.length;
    await scrollWorkspacesList(page);
    try {
      await waitForCondition(
        () => acceptedPages.length > beforeCount || anomalies.length > 0,
        CONTINUATION_TIMEOUT_MS,
        `page ${expectedPage} of the workspace list`,
      );
    } catch (err) {
      await page.close();
      throw new Error(`Workspace-list pagination stalled — no response matched expected page ${expectedPage}: ${err.message}`);
    }
    if (anomalies.length > 0) {
      await page.close();
      throw new Error(anomalies[0]);
    }
  }

  await page.close();

  const all = acceptedPages.flatMap((p) => p.projects);
  const seenIds = new Set();
  for (const p of all) {
    if (seenIds.has(p.id)) {
      throw new Error(`Duplicate workspace id across discovery pages: ${p.id} — refusing to report an inconsistent inventory`);
    }
    seenIds.add(p.id);
  }
  if (all.length !== numTotalResults) {
    throw new Error(`Collected ${all.length} workspaces but num_total_results said ${numTotalResults} — refusing to report a mismatched inventory`);
  }

  return { numTotalResults, projects: all };
}

function loadArchivedWorkspaceIds() {
  const ids = new Set();
  if (!existsSync(ARCHIVE_FILE)) return ids;
  const lines = readFileSync(ARCHIVE_FILE, "utf-8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      if (rec?.workspaceId) ids.add(rec.workspaceId);
    } catch {
      // skip corrupt line
    }
  }
  return ids;
}

async function main() {
  console.log(`Connecting to Chrome over CDP at ${CDP_ENDPOINT} ...`);
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  } catch (err) {
    console.error(`FAIL: could not connect to Chrome over CDP at ${CDP_ENDPOINT}.`);
    console.error(String(err?.message ?? err));
    process.exit(1);
  }

  console.log(`Discovering full workspace inventory from ${WORKSPACES_URL} ...`);
  let discovered;
  try {
    discovered = await discoverAllWorkspaces(browser);
  } catch (err) {
    console.error(`FAIL: ${err?.message ?? err}`);
    process.exit(1);
  }

  mkdirSync(WORKSPACE_RECON_DIR, { recursive: true });
  writeFileSync(INVENTORY_OUT, JSON.stringify(discovered, null, 2), "utf-8");
  console.log(`Wrote discovered inventory -> ${INVENTORY_OUT}`);

  const archivedIds = loadArchivedWorkspaceIds();

  const unresolved = [];
  const alreadyRepresented = [];
  const remaining = [];

  for (const p of discovered.projects) {
    if (!UUID_RE.test(p.id)) {
      unresolved.push({ ...p, reason: `id "${p.id}" is not a UUID — not addressable via /create?wid=` });
      continue;
    }
    if (archivedIds.has(p.id)) {
      alreadyRepresented.push(p);
    } else {
      remaining.push(p);
    }
  }

  const manifestLines = [
    `# Suno remaining-workspace manifest — generated ${new Date().toISOString()}`,
    `# Discovered ${discovered.projects.length} total, ${alreadyRepresented.length} already in archive, ${remaining.length} remaining, ${unresolved.length} unresolved.`,
    `# Review before feeding into: node scripts/acquireSunoWorkspace.mjs --manifest <this file>`,
    "",
    ...remaining.flatMap((p) => [
      `# ${p.name || "(untitled)"} — ${p.clip_count} clip(s), last updated ${p.last_updated_clip}`,
      `https://suno.com/create?wid=${p.id}`,
      "",
    ]),
  ];
  writeFileSync(MANIFEST_OUT, manifestLines.join("\n"), "utf-8");
  console.log(`Wrote remaining-workspace manifest -> ${MANIFEST_OUT}`);

  console.log(`\n=== INVENTORY SUMMARY ===`);
  console.log(
    JSON.stringify(
      {
        totalDiscovered: discovered.projects.length,
        alreadyRepresented: alreadyRepresented.length,
        remainingUncaptured: remaining.length,
        unresolved: unresolved.map((u) => ({ id: u.id, name: u.name, clip_count: u.clip_count, reason: u.reason })),
        remainingWorkspaces: remaining.map((p) => ({
          id: p.id,
          name: p.name,
          clip_count: p.clip_count,
          last_updated_clip: p.last_updated_clip,
        })),
      },
      null,
      2,
    ),
  );

  process.exit(0);
}

main();
