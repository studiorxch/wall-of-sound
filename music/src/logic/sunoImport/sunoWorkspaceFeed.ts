// MUSIC — Suno Workspace Feed Collector (v4.5 first batch, 0905 recon)
//
// Suno's authenticated workspace pagination contract, proven empirically
// against two real workspaces before this module was written:
//   - Article Hunter (38 clips): GET /api/project/{wid} returns the first
//     20, one POST /api/feed/v3 continuation returns the remaining 18
//     with has_more:false. See __fixtures__/suno-workspace-project-
//     article-hunter-page1.json and suno-feed-v3-continuation-article-
//     hunter.json (both the request and response were captured).
//   - Tron Arc 2.0 (149 clips): 7 full 20-clip continuation pages plus one
//     9-clip terminal page, has_more:false only on the last. Every
//     cursor transition (7 of them) was directly verified as
//     response.next_cursor === next request's cursor. See
//     __fixtures__/suno-feed-v3-tron-arc-call8-final-page.json for the
//     final page's full raw body.
//
// Contract:
//   - First page: GET /api/project/{workspaceId} -> project_clips[] (up
//     to 20), clip_count (the real total).
//   - Continuation: POST /api/feed/v3 with buildSunoFeedV3Payload(...) ->
//     { clips: [...], has_more, next_cursor }. cursor is the last-seen
//     clip's UUID; the server also returns next_cursor explicitly, which
//     we cross-check against the last clip's own id rather than trusting
//     either value blindly.
//   - Stop the moment has_more is false. A workspace whose entire
//     clip_count already fit on page 1 never calls /api/feed/v3 at all.
//
// This module has no fetch/DOM dependency of its own. Callers (a Node
// script reading pre-captured fixtures, a browser console script running
// in an authenticated Suno tab, or a test) inject fetchProject/fetchFeed,
// so the exact same pagination and integrity-check logic runs identically
// regardless of where the data actually comes from.
//
// Never mutates MUSIC Catalog. Never downloads audio. Classifies every
// clip by its OWN major_model_version/model_name fields — never by the
// workspace's manually-assigned label; a workspace's own label is only
// ever a starting hypothesis, not authority (proven necessary: Tron Arc
// 2.0, manually labeled "4.5", contains clips reporting major_model_
// version "v4.5" with model_name "chirp-auk", distinct from Article
// Hunter's "v4.5+"/"chirp-bluejay" — real, observed schema variance).

export interface SunoWorkspaceClip {
  id: string;
  title?: string;
  status?: string;
  entity_type?: string;
  major_model_version?: string;
  model_name?: string;
  created_at?: string;
  is_public?: boolean;
  batch_index?: number;
  display_tags?: string;
  media_urls?: Array<{ url?: string; content_type?: string }>;
  image_url?: string;
  image_large_url?: string;
  project?: { id?: string; name?: string };
  metadata?: {
    tags?: string;
    negative_tags?: string;
    prompt?: string;
    duration?: number;
    type?: string;
  };
  // Suno's own schema has proven internally inconsistent — e.g. `reaction`
  // and even `ownership` are sometimes entirely absent on a clip that
  // otherwise looks identical to its siblings. Preserve whatever else is
  // present rather than typing (and silently dropping) only known fields.
  [key: string]: unknown;
}

export interface SunoProjectResponse {
  id: string;
  name?: string;
  description?: string;
  project_clips: Array<{ clip: SunoWorkspaceClip; relative_index?: number; pinned?: boolean }>;
  pinned_clips?: unknown[];
  is_owned?: boolean;
  is_trashed?: boolean;
  clip_count: number;
  current_page?: number;
  shared?: boolean;
}

export interface SunoFeedV3Filters {
  disliked: "False" | "True";
  trashed: "False" | "True";
  fromStudioProject: { presence: "False" | "True" };
  stem: { presence: "False" | "True" };
  stemComplement: "False" | "True";
  workspace: { presence: "True"; workspaceId: string };
}

export interface SunoFeedV3RequestPayload {
  cursor: string | null;
  limit: number;
  filters: SunoFeedV3Filters;
}

export interface SunoFeedV3Response {
  clips: SunoWorkspaceClip[];
  has_more: boolean;
  next_cursor?: string | null;
}

const FEED_PAGE_LIMIT = 20;
const MAX_CONTINUATIONS = 50;

export function buildSunoFeedV3Payload(workspaceId: string, cursor: string | null): SunoFeedV3RequestPayload {
  return {
    cursor,
    limit: FEED_PAGE_LIMIT,
    filters: {
      disliked: "False",
      trashed: "False",
      fromStudioProject: { presence: "False" },
      stem: { presence: "False" },
      stemComplement: "False",
      workspace: { presence: "True", workspaceId },
    },
  };
}

export type SunoWorkspacePromptState = "populated" | "empty" | "absent";

export interface SunoWorkspaceCollectedRecord {
  sunoUuid: string;
  title?: string;
  status?: string;
  majorModelVersion?: string;
  modelName?: string;
  createdAt?: string;
  isPublic?: boolean;
  batchIndex?: number;
  promptState: SunoWorkspacePromptState;
  prompt?: string;
  style?: string;
  tags: string[];
  negativeTags?: string;
  displayTags?: string;
  durationSeconds?: number;
  mediaUrl?: string;
  imageUrl?: string;
  imageLargeUrl?: string;
  projectId?: string;
  projectName?: string;
  sunoUrl: string;
  raw: SunoWorkspaceClip;
}

export function classifySunoWorkspaceClip(clip: SunoWorkspaceClip): SunoWorkspaceCollectedRecord {
  const promptRaw = clip.metadata?.prompt;
  const promptState: SunoWorkspacePromptState =
    typeof promptRaw !== "string" ? "absent" : promptRaw.length === 0 ? "empty" : "populated";
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

export class SunoWorkspaceCollectionError extends Error {
  readonly details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "SunoWorkspaceCollectionError";
    this.details = details;
  }
}

export type FetchSunoProjectFn = (workspaceId: string) => Promise<SunoProjectResponse>;
export type FetchSunoFeedFn = (payload: SunoFeedV3RequestPayload) => Promise<SunoFeedV3Response>;

export interface SunoWorkspaceFeedCallLog {
  requestPayload: SunoFeedV3RequestPayload;
  response: SunoFeedV3Response;
}

export interface SunoWorkspaceCollectionSummary {
  initialPageCount: number;
  continuationCallCount: number;
  clipsPerContinuationCall: number[];
  distinctUuidCount: number;
  duplicateUuidCount: number;
  crossWorkspaceLeakageCount: number;
  modelVersionDistribution: Record<string, number>;
  promptStateDistribution: Record<SunoWorkspacePromptState, number>;
  negativeTagsPresentCount: number;
  finalHasMore: boolean;
  pass: boolean;
}

export interface SunoWorkspaceCollectionResult {
  workspaceId: string;
  workspaceName?: string;
  expectedClipCount: number;
  projectResponse: SunoProjectResponse;
  feedCalls: SunoWorkspaceFeedCallLog[];
  clips: SunoWorkspaceClip[];
  records: SunoWorkspaceCollectedRecord[];
  summary: SunoWorkspaceCollectionSummary;
}

// Requirements enforced here (per the 0905 recon sign-off):
//  1. dedupe every clip by UUID (throws on any repeat)
//  2. cross-workspace clips are counted, not silently dropped or fatal
//  3. distinct-clip count is reported in the summary
//  4. next_cursor is validated against the final clip.id when the server
//     supplies it, and only relied on for the actual next request when it
//     agrees (or is absent) — the derived value is the fallback of record
//  5. the loop stops only on has_more === false
//  6. a cursor that fails to advance, or repeats a prior cursor, aborts
//  7. raw project/feed responses are preserved verbatim in the result
//     (feedCalls / projectResponse) before any classification happens
//  8. classifySunoWorkspaceClip reads major_model_version/model_name per
//     clip, never the workspace's own manual label
//  9. prompt state (populated/empty/absent) is preserved as its own field
// 10. negative_tags is read only if present; never required
export async function collectSunoWorkspace(
  workspaceId: string,
  fetchProject: FetchSunoProjectFn,
  fetchFeed: FetchSunoFeedFn,
): Promise<SunoWorkspaceCollectionResult> {
  const projectResponse = await fetchProject(workspaceId);
  if (!Array.isArray(projectResponse?.project_clips) || typeof projectResponse?.clip_count !== "number") {
    throw new SunoWorkspaceCollectionError("Unexpected /api/project response shape", projectResponse);
  }

  const expectedClipCount = projectResponse.clip_count;
  const firstPageClips = projectResponse.project_clips.map((pc) => pc.clip);

  const seenIds = new Set<string>();
  const allClips: SunoWorkspaceClip[] = [];
  let crossWorkspaceLeakageCount = 0;

  function ingest(clip: SunoWorkspaceClip, context: string): void {
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

  for (const clip of firstPageClips) ingest(clip, "initial page");
  if (allClips.length === 0) {
    throw new SunoWorkspaceCollectionError("Initial page returned zero clips — cannot derive a starting cursor");
  }

  let cursor: string | null = allClips[allClips.length - 1].id;
  let hasMore = expectedClipCount > allClips.length;
  const seenCursors = new Set<string>([cursor]);
  const feedCalls: SunoWorkspaceFeedCallLog[] = [];

  while (hasMore) {
    if (feedCalls.length >= MAX_CONTINUATIONS) {
      throw new SunoWorkspaceCollectionError(`Exceeded safety cap of ${MAX_CONTINUATIONS} continuation calls`);
    }

    const requestPayload = buildSunoFeedV3Payload(workspaceId, cursor);
    const response = await fetchFeed(requestPayload);
    if (!Array.isArray(response?.clips) || typeof response?.has_more !== "boolean") {
      throw new SunoWorkspaceCollectionError("Unexpected /api/feed/v3 response shape", response);
    }
    feedCalls.push({ requestPayload, response });

    if (response.clips.length === 0 && response.has_more) {
      throw new SunoWorkspaceCollectionError("Continuation returned zero clips while has_more was true");
    }

    for (const clip of response.clips) ingest(clip, `continuation call #${feedCalls.length}`);

    if (allClips.length > expectedClipCount) {
      throw new SunoWorkspaceCollectionError("Total clips exceeded clip_count", {
        total: allClips.length,
        expectedClipCount,
      });
    }

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
      if (seenCursors.has(nextCursor)) {
        throw new SunoWorkspaceCollectionError("Cursor repeated across pages — possible pagination loop", { nextCursor });
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    hasMore = response.has_more;
  }

  const records = allClips.map(classifySunoWorkspaceClip);
  const modelVersionDistribution: Record<string, number> = {};
  const promptStateDistribution: Record<SunoWorkspacePromptState, number> = { populated: 0, empty: 0, absent: 0 };
  let negativeTagsPresentCount = 0;
  for (const r of records) {
    const key = `${r.majorModelVersion ?? "unknown"}::${r.modelName ?? "unknown"}`;
    modelVersionDistribution[key] = (modelVersionDistribution[key] ?? 0) + 1;
    promptStateDistribution[r.promptState]++;
    if (r.negativeTags) negativeTagsPresentCount++;
  }

  return {
    workspaceId,
    workspaceName: projectResponse.name,
    expectedClipCount,
    projectResponse,
    feedCalls,
    clips: allClips,
    records,
    summary: {
      initialPageCount: firstPageClips.length,
      continuationCallCount: feedCalls.length,
      clipsPerContinuationCall: feedCalls.map((c) => c.response.clips.length),
      distinctUuidCount: seenIds.size,
      duplicateUuidCount: allClips.length - seenIds.size,
      crossWorkspaceLeakageCount,
      modelVersionDistribution,
      promptStateDistribution,
      negativeTagsPresentCount,
      finalHasMore: hasMore,
      pass: seenIds.size === expectedClipCount && crossWorkspaceLeakageCount === 0,
    },
  };
}

// ---------------------------------------------------------------------
// Capture-replay path — for ingesting already-captured response bodies
// (the only sanctioned way to get real data; see the module header).
// Unlike collectSunoWorkspace above, projectResponse may be null: a
// workspace's first capture is sometimes a bare /api/feed/v3 body
// (cursor:null) rather than a GET /api/project/{wid} body — proven by
// the Electrical Playground capture, whose top-level shape was
// {clips, has_more} with no id/name/project_clips/clip_count at all.
// When that happens there is no authoritative clip_count to validate
// against — only a derived terminal total, trusted only once has_more
// genuinely reaches false, and never conflated with an authoritative
// project clip_count.
// ---------------------------------------------------------------------

export type SunoWorkspaceProvenanceMode = "project-anchored" | "feed-only";

export interface SunoWorkspaceFeedCapture {
  cursor: string | null;
  response: SunoFeedV3Response;
}

export interface SunoWorkspaceCaptureInput {
  projectResponse: SunoProjectResponse | null;
  feedCaptures: SunoWorkspaceFeedCapture[];
  // Whether the request that produced feedCaptures[0] was independently
  // confirmed (e.g. read directly off a DevTools Network row) to be
  // /api/feed/v3 with cursor:null, as opposed to inferred from body
  // shape alone. Defaults to false — unconfirmed — when omitted, which
  // is the honest default any time this can't be checked.
  provenanceConfirmed?: boolean;
}

export interface SunoWorkspaceCaptureCollectionResult {
  workspaceId: string;
  workspaceName?: string;
  provenanceMode: SunoWorkspaceProvenanceMode;
  provenanceConfirmed: boolean;
  expectedClipCount: number | null;
  derivedTerminalTotal: number | null;
  clips: SunoWorkspaceClip[];
  records: SunoWorkspaceCollectedRecord[];
  summary: SunoWorkspaceCollectionSummary;
}

export function collectSunoWorkspaceFromCaptures(
  workspaceId: string,
  input: SunoWorkspaceCaptureInput,
): SunoWorkspaceCaptureCollectionResult {
  const { projectResponse, feedCaptures, provenanceConfirmed = false } = input;

  const seenIds = new Set<string>();
  const allClips: SunoWorkspaceClip[] = [];
  let crossWorkspaceLeakageCount = 0;

  function ingest(clip: SunoWorkspaceClip, context: string): void {
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

  function checkResponseShape(response: SunoFeedV3Response, label: string): void {
    if (!Array.isArray(response?.clips) || typeof response?.has_more !== "boolean") {
      throw new SunoWorkspaceCollectionError(`Unexpected ${label} response shape`, response);
    }
  }

  function validateAndAdvanceCursor(response: SunoFeedV3Response, cursor: string | null): string | null {
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

  let expectedClipCount: number | null = null;
  let provenanceMode: SunoWorkspaceProvenanceMode;
  let cursor: string | null;
  let hasMore: boolean;
  const seenCursors = new Set<string>();
  let queueIndex = 0;
  const feedCallsLog: Array<{ cursorUsed: string | null; response: SunoFeedV3Response }> = [];

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
      throw new SunoWorkspaceCollectionError("Total clips exceeded clip_count", {
        total: allClips.length,
        expectedClipCount,
      });
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
  const records = allClips.map(classifySunoWorkspaceClip);
  const modelVersionDistribution: Record<string, number> = {};
  const promptStateDistribution: Record<SunoWorkspacePromptState, number> = { populated: 0, empty: 0, absent: 0 };
  let negativeTagsPresentCount = 0;
  for (const r of records) {
    const key = `${r.majorModelVersion ?? "unknown"}::${r.modelName ?? "unknown"}`;
    modelVersionDistribution[key] = (modelVersionDistribution[key] ?? 0) + 1;
    promptStateDistribution[r.promptState]++;
    if (r.negativeTags) negativeTagsPresentCount++;
  }

  // Pass criteria differ by provenance: a project-anchored capture can be
  // checked against an authoritative clip_count; a feed-only capture can
  // only be checked for internal cleanliness (no dupes — enforced above
  // by ingest already — no leakage, and a genuine has_more:false ending).
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
    clips: allClips,
    records,
    summary: {
      initialPageCount: provenanceMode === "project-anchored" ? projectResponse!.project_clips.length : feedCallsLog[0].response.clips.length,
      continuationCallCount: provenanceMode === "project-anchored" ? feedCallsLog.length : feedCallsLog.length - 1,
      clipsPerContinuationCall: (provenanceMode === "project-anchored" ? feedCallsLog : feedCallsLog.slice(1)).map(
        (c) => c.response.clips.length,
      ),
      distinctUuidCount: seenIds.size,
      duplicateUuidCount: allClips.length - seenIds.size,
      crossWorkspaceLeakageCount,
      modelVersionDistribution,
      promptStateDistribution,
      negativeTagsPresentCount,
      finalHasMore: hasMore,
      pass,
    },
  };
}
