/**
 * Merge one or more captured Suno workspace collections into the durable
 * Suno Metadata Archive — MUSIC 0905, "v4.5 workspace recovery, first
 * batch" collector.
 *
 * Why this script exists rather than fetching live: studio-api-prod.
 * suno.com's /api/project/{wid} and /api/feed/v3 endpoints require the
 * user's own authenticated Suno session. A raw `fetch()` — even one
 * issued from inside an already-authenticated Suno browser tab — returns
 * 401, proving the app attaches auth some other way than a plain shared
 * cookie. Per explicit instruction, this project never extracts or
 * reproduces that auth mechanism. So the only sanctioned way to get real
 * data is: the user reads the raw request/response bodies directly out
 * of their own browser's Network tab (bodies only — never headers,
 * cookies, or tokens) and hands them over as plain JSON, exactly as was
 * done for the Article Hunter and Tron Arc 2.0 reconnaissance. This
 * script is the ingestion side of that pipeline.
 *
 * Input: one or more JSON files shaped as —
 *   {
 *     "workspaceId": "<uuid>",
 *     "workspaceName": "<optional display name>",
 *     "projectResponse": { ... raw GET /api/project/{wid} body ... } | null,
 *     "feedResponses": [ { "cursor": <string|null>, "response": { ... raw POST /api/feed/v3 body ... } }, ... ],  // in call order
 *     "provenanceConfirmed": <boolean, optional, default false>
 *   }
 *
 * projectResponse may be null: a workspace's first captured body is
 * sometimes a bare /api/feed/v3 response (cursor:null), not a GET
 * /api/project/{wid} body — proven by the Electrical Playground capture,
 * whose top-level shape was {clips, has_more} with no id/name/
 * project_clips/clip_count at all. When that happens there is no
 * authoritative clip_count to validate against — only a derivedTerminalTotal,
 * trusted only once has_more genuinely reaches false, and never reported
 * as if it were an authoritative project clip_count. provenanceConfirmed
 * records whether the request that produced feedResponses[0] was actually
 * confirmed (e.g. read directly off a DevTools Network row) to be
 * /api/feed/v3 with cursor:null, as opposed to inferred from body shape
 * alone — defaults to false, the honest default when this can't be checked.
 *
 * The pagination/integrity logic here is a plain-JS port of
 * src/logic/sunoImport/sunoWorkspaceFeed.ts's collectSunoWorkspaceFromCaptures()
 * — kept behaviorally identical (see that file's own test suite, which
 * replays the exact same real workspaces this script was proven against,
 * project-anchored and feed-only alike) — duplicated so this can run
 * standalone via `node`, matching this project's existing convention for
 * one-off batch scripts (see buildSunoMetadataArchive.mjs).
 *
 * Never fetches anything. Never touches MUSIC Catalog. Never downloads
 * audio. Classifies every clip by its OWN major_model_version/model_name
 * — never by the workspace's manually-assigned version label.
 *
 * Usage:
 *   node scripts/mergeSunoWorkspaceCollection.mjs <capture.json> [<capture2.json> ...]
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { gzipSync } from "zlib";
import { fileURLToPath } from "url";
import { dirname, resolve, join, basename } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MUSIC_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(MUSIC_ROOT, "..");
const ARCHIVE_DIR = join(REPO_ROOT, "WOS-share", "SUNO_LIBRARY", "SUNO_METADATA_ARCHIVE");
const ARCHIVE_FILE = join(ARCHIVE_DIR, "archive.jsonl");
const RAW_WORKSPACE_DIR = join(ARCHIVE_DIR, "raw", "workspace");

const inputPaths = process.argv.slice(2);
if (inputPaths.length === 0) {
  console.error("Usage: node scripts/mergeSunoWorkspaceCollection.mjs <capture.json> [<capture2.json> ...]");
  process.exit(1);
}

// ---------------------------------------------------------------------
// Pagination/integrity logic — plain-JS port of
// collectSunoWorkspaceFromCaptures() in
// src/logic/sunoImport/sunoWorkspaceFeed.ts. Kept behaviorally identical;
// this duplication is the same standalone-script tradeoff
// buildSunoMetadataArchive.mjs already made for the Flight parser.
// ---------------------------------------------------------------------
class SunoWorkspaceCollectionError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "SunoWorkspaceCollectionError";
    this.details = details;
  }
}

const MAX_CONTINUATIONS = 50;

function classifySunoWorkspaceClip(clip) {
  const promptRaw = clip.metadata?.prompt;
  const promptState = typeof promptRaw !== "string" ? "absent" : promptRaw.length === 0 ? "empty" : "populated";
  const rawTags = clip.metadata?.tags;
  return {
    sunoUuid: clip.id,
    title: clip.title,
    status: clip.status,
    majorModelVersion: clip.major_model_version,
    modelName: clip.model_name,
    createdAt: clip.created_at,
    isPublic: clip.is_public,
    batchIndex: clip.batch_index,
    promptState,
    prompt: promptState === "populated" ? promptRaw : undefined,
    style: rawTags || undefined,
    tags: rawTags ? rawTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    negativeTags: clip.metadata?.negative_tags || undefined,
    displayTags: clip.display_tags,
    durationSeconds: clip.metadata?.duration,
    mediaUrl: clip.media_urls?.[0]?.url,
    imageUrl: clip.image_url,
    imageLargeUrl: clip.image_large_url,
    projectId: clip.project?.id,
    projectName: clip.project?.name,
    sunoUrl: `https://suno.com/song/${clip.id}`,
    raw: clip,
  };
}

function classifyAll(allClips) {
  const records = allClips.map(classifySunoWorkspaceClip);
  const modelVersionDistribution = {};
  const promptStateDistribution = { populated: 0, empty: 0, absent: 0 };
  let negativeTagsPresentCount = 0;
  for (const r of records) {
    const key = `${r.majorModelVersion ?? "unknown"}::${r.modelName ?? "unknown"}`;
    modelVersionDistribution[key] = (modelVersionDistribution[key] ?? 0) + 1;
    promptStateDistribution[r.promptState]++;
    if (r.negativeTags) negativeTagsPresentCount++;
  }
  return { records, modelVersionDistribution, promptStateDistribution, negativeTagsPresentCount };
}

// Plain-JS port of collectSunoWorkspaceFromCaptures() in
// src/logic/sunoImport/sunoWorkspaceFeed.ts. projectResponse may be null
// (see file header) — in that case feedCaptures[0] (shape
// {cursor, response}) bootstraps the whole collection instead.
function collectSunoWorkspaceFromCaptures(workspaceId, { projectResponse, feedCaptures, provenanceConfirmed = false }) {
  const seenIds = new Set();
  const allClips = [];
  let crossWorkspaceLeakageCount = 0;

  function ingest(clip, context) {
    if (!clip || typeof clip.id !== "string") {
      throw new SunoWorkspaceCollectionError("Clip missing a usable id", { context, clip });
    }
    if (seenIds.has(clip.id)) {
      throw new SunoWorkspaceCollectionError(`Duplicate UUID across pages: ${clip.id}`, { context });
    }
    seenIds.add(clip.id);
    if (clip.project?.id && clip.project.id !== workspaceId) crossWorkspaceLeakageCount++;
    allClips.push(clip);
  }

  function checkResponseShape(response, label) {
    if (!Array.isArray(response?.clips) || typeof response?.has_more !== "boolean") {
      throw new SunoWorkspaceCollectionError(`Unexpected ${label} response shape`, response);
    }
  }

  function validateAndAdvanceCursor(response, cursor) {
    const derivedNextCursor = response.clips.length > 0 ? response.clips[response.clips.length - 1].id : null;
    if (response.next_cursor != null && derivedNextCursor != null && response.next_cursor !== derivedNextCursor) {
      throw new SunoWorkspaceCollectionError("Server next_cursor does not match the final returned clip.id", {
        nextCursor: response.next_cursor,
        derivedNextCursor,
      });
    }
    const nextCursor = response.next_cursor ?? derivedNextCursor;
    if (response.has_more) {
      if (nextCursor == null) {
        throw new SunoWorkspaceCollectionError("has_more is true but no cursor could be derived for the next call");
      }
      if (nextCursor === cursor) {
        throw new SunoWorkspaceCollectionError("Cursor failed to advance while has_more was true", { cursor });
      }
    }
    return nextCursor;
  }

  let expectedClipCount = null;
  let provenanceMode;
  let cursor;
  let hasMore;
  const seenCursors = new Set();
  let queueIndex = 0;
  const feedCallsLog = [];

  if (projectResponse != null) {
    provenanceMode = "project-anchored";
    if (!Array.isArray(projectResponse.project_clips) || typeof projectResponse.clip_count !== "number") {
      throw new SunoWorkspaceCollectionError("Unexpected /api/project response shape", projectResponse);
    }
    expectedClipCount = projectResponse.clip_count;
    for (const pc of projectResponse.project_clips) ingest(pc.clip, "initial page (project)");
    if (allClips.length === 0) {
      throw new SunoWorkspaceCollectionError("Initial project page returned zero clips — cannot derive a starting cursor");
    }
    cursor = allClips[allClips.length - 1].id;
    hasMore = expectedClipCount > allClips.length;
    seenCursors.add(cursor);
  } else {
    provenanceMode = "feed-only";
    if (!feedCaptures || feedCaptures.length === 0) {
      throw new SunoWorkspaceCollectionError("projectResponse is null and no feedCaptures were supplied — nothing to ingest");
    }
    const first = feedCaptures[queueIndex++];
    checkResponseShape(first.response, "/api/feed/v3 (initial, feed-only)");
    feedCallsLog.push({ cursorUsed: first.cursor, response: first.response });
    for (const clip of first.response.clips) ingest(clip, "initial page (feed-only)");
    if (allClips.length === 0 && first.response.has_more) {
      throw new SunoWorkspaceCollectionError("First feed-only capture returned zero clips while has_more was true");
    }
    const nextCursor = validateAndAdvanceCursor(first.response, first.cursor ?? null);
    hasMore = first.response.has_more;
    cursor = nextCursor ?? first.cursor ?? null;
    if (cursor != null) seenCursors.add(cursor);
  }

  while (hasMore) {
    if (feedCallsLog.length >= MAX_CONTINUATIONS) {
      throw new SunoWorkspaceCollectionError(`Exceeded safety cap of ${MAX_CONTINUATIONS} continuation calls`);
    }
    if (queueIndex >= feedCaptures.length) {
      throw new SunoWorkspaceCollectionError(
        `has_more was true but no more captured feed responses were supplied (needed call #${feedCallsLog.length + 1})`,
      );
    }
    const next = feedCaptures[queueIndex++];
    checkResponseShape(next.response, "/api/feed/v3 (continuation)");
    feedCallsLog.push({ cursorUsed: next.cursor, response: next.response });

    if (next.response.clips.length === 0 && next.response.has_more) {
      throw new SunoWorkspaceCollectionError("Continuation returned zero clips while has_more was true");
    }
    for (const clip of next.response.clips) ingest(clip, `continuation call #${feedCallsLog.length}`);

    if (expectedClipCount != null && allClips.length > expectedClipCount) {
      throw new SunoWorkspaceCollectionError("Total clips exceeded clip_count", { total: allClips.length, expectedClipCount });
    }

    const nextCursor = validateAndAdvanceCursor(next.response, cursor);
    if (next.response.has_more) {
      if (nextCursor != null && seenCursors.has(nextCursor)) {
        throw new SunoWorkspaceCollectionError("Cursor repeated across pages — possible pagination loop", { nextCursor });
      }
      if (nextCursor != null) seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    hasMore = next.response.has_more;
  }

  if (queueIndex < feedCaptures.length) {
    throw new SunoWorkspaceCollectionError(
      `${feedCaptures.length - queueIndex} captured feed response(s) were supplied but never needed (has_more went false early) — capture/collector mismatch`,
    );
  }

  const derivedTerminalTotal = hasMore === false ? allClips.length : null;
  const { records, modelVersionDistribution, promptStateDistribution, negativeTagsPresentCount } = classifyAll(allClips);

  const pass =
    crossWorkspaceLeakageCount === 0 &&
    (provenanceMode === "project-anchored" ? seenIds.size === expectedClipCount : hasMore === false);

  return {
    workspaceId,
    workspaceName: projectResponse?.name,
    provenanceMode,
    provenanceConfirmed,
    expectedClipCount,
    derivedTerminalTotal,
    records,
    summary: {
      initialPageCount: provenanceMode === "project-anchored" ? projectResponse.project_clips.length : feedCallsLog[0].response.clips.length,
      continuationCallCount: provenanceMode === "project-anchored" ? feedCallsLog.length : feedCallsLog.length - 1,
      clipsPerContinuationCall: (provenanceMode === "project-anchored" ? feedCallsLog : feedCallsLog.slice(1)).map(
        (c) => c.response.clips.length,
      ),
      distinctUuidCount: seenIds.size,
      crossWorkspaceLeakageCount,
      modelVersionDistribution,
      promptStateDistribution,
      negativeTagsPresentCount,
      finalHasMore: hasMore,
      pass,
    },
  };
}

// ---------------------------------------------------------------------
// Archive persistence — same convention as buildSunoMetadataArchive.mjs.
// ---------------------------------------------------------------------
function loadArchive() {
  const map = new Map();
  if (!existsSync(ARCHIVE_FILE)) return map;
  const lines = readFileSync(ARCHIVE_FILE, "utf-8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      if (rec?.sunoUuid) map.set(rec.sunoUuid, rec);
    } catch {
      // skip corrupt line rather than aborting the whole load
    }
  }
  return map;
}

function saveArchive(map) {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const lines = Array.from(map.values())
    .sort((a, b) => a.sunoUuid.localeCompare(b.sunoUuid))
    .map((r) => JSON.stringify(r));
  writeFileSync(ARCHIVE_FILE, lines.join("\n") + "\n", "utf-8");
}

function richnessRank(rec) {
  if (!rec) return -1;
  if (rec.status === "rich") return 2;
  if (rec.status === "identity_only") return 1;
  return 0;
}

function recordFromClassified(record, workspaceId, workspaceName, provenanceConfirmed) {
  const sourceLabel = `suno-workspace-feed:${workspaceName ?? workspaceId}`;
  return {
    sunoUuid: record.sunoUuid,
    status: "rich", // workspace-feed data always carries title/tags/model/duration — strictly richer than an identity-only fallback.
    title: record.title,
    prompt: record.prompt,
    style: record.style,
    tags: record.tags,
    imageUrl: record.imageLargeUrl ?? record.imageUrl,
    durationSeconds: record.durationSeconds,
    createdAt: record.createdAt,
    model: record.majorModelVersion,
    sunoUrl: record.sunoUrl,
    fetchedAt: new Date().toISOString(),
    sources: [provenanceConfirmed ? sourceLabel : `${sourceLabel} (request provenance unconfirmed)`],
    promptState: record.promptState,
    modelName: record.modelName,
    negativeTags: record.negativeTags,
    workspaceId,
  };
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
async function main() {
  const archive = loadArchive();
  const archiveSizeBefore = archive.size;

  const report = {
    workspacesAttempted: 0,
    workspacesPassed: 0,
    workspacesFailed: 0,
    songsEnumerated: 0,
    modelVersionDistributionAcrossBatch: {},
    uuidsFound: 0,
    newUuids: 0,
    alreadyArchivedUuids: 0,
    recordsUpdated: 0,
    duplicateUuidsWithinBatch: 0,
    paginationAnomalies: [],
    perWorkspace: [],
  };

  const seenAcrossBatch = new Set();

  for (const inputPath of inputPaths) {
    report.workspacesAttempted++;
    let capture;
    try {
      capture = JSON.parse(readFileSync(inputPath, "utf-8"));
    } catch (err) {
      report.workspacesFailed++;
      report.paginationAnomalies.push({ inputPath, error: `Failed to read/parse input: ${err.message}` });
      continue;
    }

    const { workspaceId, workspaceName, projectResponse = null, feedResponses = [], provenanceConfirmed = false } = capture;
    if (!workspaceId || (projectResponse == null && feedResponses.length === 0)) {
      report.workspacesFailed++;
      report.paginationAnomalies.push({
        inputPath,
        error: "Missing workspaceId, and neither projectResponse nor feedResponses were supplied",
      });
      continue;
    }

    let result;
    try {
      result = collectSunoWorkspaceFromCaptures(workspaceId, {
        projectResponse,
        feedCaptures: feedResponses,
        provenanceConfirmed,
      });
    } catch (err) {
      report.workspacesFailed++;
      report.paginationAnomalies.push({ inputPath, workspaceId, error: err.message, details: err.details });
      continue;
    }

    if (!result.summary.pass) {
      report.workspacesFailed++;
      report.paginationAnomalies.push({
        inputPath,
        workspaceId,
        error: "Collector completed but summary.pass is false",
        summary: result.summary,
      });
      continue;
    }
    report.workspacesPassed++;

    for (const r of result.records) {
      report.songsEnumerated++;
      const key = `${r.majorModelVersion ?? "unknown"}::${r.modelName ?? "unknown"}`;
      report.modelVersionDistributionAcrossBatch[key] = (report.modelVersionDistributionAcrossBatch[key] ?? 0) + 1;

      if (seenAcrossBatch.has(r.sunoUuid)) {
        report.duplicateUuidsWithinBatch++;
      }
      seenAcrossBatch.add(r.sunoUuid);
      report.uuidsFound++;

      const existing = archive.get(r.sunoUuid);
      if (existing) report.alreadyArchivedUuids++;
      else report.newUuids++;

      const candidate = recordFromClassified(r, workspaceId, workspaceName, result.provenanceConfirmed);
      const newRank = richnessRank(candidate);
      if (newRank >= richnessRank(existing)) {
        if (existing) report.recordsUpdated++;
        archive.set(r.sunoUuid, candidate);
      }
    }

    // Preserve the complete raw capture (project response + every feed
    // response) verbatim, before any of the normalization above — a
    // future re-classification never needs to re-ask the user for data.
    mkdirSync(RAW_WORKSPACE_DIR, { recursive: true });
    const rawSnapshotFile = join(RAW_WORKSPACE_DIR, `${workspaceId}.json.gz`);
    writeFileSync(rawSnapshotFile, gzipSync(Buffer.from(JSON.stringify(capture), "utf-8")));

    report.perWorkspace.push({
      inputPath: basename(inputPath),
      workspaceId,
      workspaceName,
      provenanceMode: result.provenanceMode,
      provenanceConfirmed: result.provenanceConfirmed,
      expectedClipCount: result.expectedClipCount,
      derivedTerminalTotal: result.derivedTerminalTotal,
      distinctUuidCount: result.summary.distinctUuidCount,
      continuationCallCount: result.summary.continuationCallCount,
      modelVersionDistribution: result.summary.modelVersionDistribution,
      promptStateDistribution: result.summary.promptStateDistribution,
      pass: result.summary.pass,
    });
  }

  saveArchive(archive);

  console.log("\n=== PER-WORKSPACE RESULTS ===");
  console.log(JSON.stringify(report.perWorkspace, null, 2));

  console.log("\n=== BATCH SUMMARY ===");
  console.log(JSON.stringify({
    workspacesAttempted: report.workspacesAttempted,
    workspacesPassed: report.workspacesPassed,
    workspacesFailed: report.workspacesFailed,
    songsEnumerated: report.songsEnumerated,
    modelVersionDistributionAcrossBatch: report.modelVersionDistributionAcrossBatch,
    uuidsFound: report.uuidsFound,
    newUuids: report.newUuids,
    alreadyArchivedUuids: report.alreadyArchivedUuids,
    recordsUpdated: report.recordsUpdated,
    duplicateUuidsWithinBatch: report.duplicateUuidsWithinBatch,
    paginationAnomalies: report.paginationAnomalies,
    archiveSizeBefore,
    archiveSizeAfter: archive.size,
  }, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
