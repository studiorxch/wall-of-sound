// MUSIC — Suno Workspace Acquisition (browser-automation front end, 0905)
//
// Pure, browser-free helpers for scripts/acquireSunoWorkspace.mjs. This
// module has no Playwright/CDP dependency of its own — it only decides
// *what to do* with URLs and response bodies observed by the driver
// script; the driver script owns the actual network attach/capture.
//
// This module does NOT replace or modify the existing collector
// (sunoWorkspaceFeed.ts) or the existing merge pipeline
// (scripts/mergeSunoWorkspaceCollection.mjs). It only produces the same
// capture-wrapper JSON shape those already consume:
//   {
//     workspaceId, workspaceName,
//     projectResponse: <raw GET /api/project/{wid} body> | null,
//     feedResponses: [ { cursor, response: <raw POST /api/feed/v3 body> }, ... ],
//     provenanceConfirmed: boolean,
//   }
//
// scripts/acquireSunoWorkspace.mjs duplicates the small pure functions
// below in plain JS (same tradeoff mergeSunoWorkspaceCollection.mjs
// already made relative to sunoWorkspaceFeed.ts) so it can run standalone
// via `node` without a TS loader. Keep the two in sync.

export class SunoWorkspaceAcquisitionError extends Error {
  readonly details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "SunoWorkspaceAcquisitionError";
    this.details = details;
  }
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Suno's own non-UUID pseudo-workspace id for a user's unassigned clips
 * ("My Workspace"). A live observation (0906) confirmed it uses the
 * IDENTICAL /api/project/{id} + /api/feed/v3 contract as any UUID
 * workspace — Suno just substitutes this literal string for the id. This
 * is the ONLY non-UUID value ever accepted; it is not a general
 * loosening of workspace-id parsing.
 */
const DEFAULT_WORKSPACE_ID = "default";

/**
 * Extract a workspace id from either a bare UUID, the literal string
 * "default", or a Suno workspace URL such as https://suno.com/create?wid=<uuid>
 * (also tolerates ?wId=, trailing slashes, extra query params, and
 * ?wid=default). Throws rather than guessing when nothing UUID-shaped or
 * exactly "default" is found — an arbitrary non-UUID string is never
 * accepted.
 */
export function parseSunoWorkspaceId(input: string): string {
  const trimmed = input.trim();
  if (trimmed === DEFAULT_WORKSPACE_ID) return DEFAULT_WORKSPACE_ID;
  if (UUID_RE.test(trimmed) && !trimmed.includes("://") && !trimmed.includes("?")) {
    const m = trimmed.match(UUID_RE);
    if (m) return m[0];
  }
  try {
    const url = new URL(trimmed);
    const wid = url.searchParams.get("wid") ?? url.searchParams.get("wId") ?? url.searchParams.get("workspaceId");
    if (wid === DEFAULT_WORKSPACE_ID) return DEFAULT_WORKSPACE_ID;
    if (wid && UUID_RE.test(wid)) return wid.match(UUID_RE)![0];
  } catch {
    // not a URL — fall through to a last-ditch scan below
  }
  const m = trimmed.match(UUID_RE);
  if (m) return m[0];
  throw new SunoWorkspaceAcquisitionError(`Could not find a workspace id in: ${input}`);
}

/**
 * Matches Suno's GET /api/project/{workspaceId} endpoint — where
 * workspaceId is either a UUID or the literal "default" — and ONLY that
 * endpoint. Deliberately excludes sibling paths like
 * /api/project/{workspaceId}/pinned-clips: a real live capture (0905,
 * Tron Arc 2.0) showed that endpoint firing on the same page load with
 * a differently-shaped, mostly-empty body (no clip_count/project_clips
 * at all) — a looser match that accepted any trailing /suffix let that
 * body race with the real one and, when it landed first, poisoned the
 * driver's continuation check into exiting after a single page. This
 * does NOT loosen to arbitrary non-UUID project ids — only the one
 * literal value Suno itself uses for the unassigned-clips bucket.
 */
export function isSunoProjectRequestUrl(url: string): boolean {
  return /\/api\/project\/(?:[0-9a-f-]{36}|default)(?:\?.*)?$/i.test(url);
}

/** Matches Suno's POST /api/feed/v3 endpoint. */
export function isSunoFeedV3RequestUrl(url: string): boolean {
  return /\/api\/feed\/v3(?:[/?].*)?$/i.test(url);
}

export interface CapturedFeedPage {
  /** The cursor value actually sent on the outgoing request, when known. */
  cursorUsed: string | null;
  response: { clips: unknown[]; has_more: boolean; next_cursor?: string | null };
}

export interface AcquisitionSafetyLimits {
  /** Hard cap on continuation calls, mirroring the collector's own cap. */
  maxContinuations: number;
  /** Wall-clock budget for the whole workspace, in milliseconds. */
  maxDurationMs: number;
}

export const DEFAULT_ACQUISITION_LIMITS: AcquisitionSafetyLimits = {
  maxContinuations: 50,
  maxDurationMs: 5 * 60 * 1000,
};

export type ContinuationDecision =
  | { action: "stop"; reason: "terminal" }
  | { action: "continue" }
  | { action: "abort"; reason: string };

/**
 * Decide what the driver should do next, given the pages captured so far.
 * Pure — no I/O, no timers — so the actual timeout/interval enforcement
 * lives in the driver script, which can check elapsed wall-clock time
 * itself and pass that in.
 */
export function decideNextAction(
  pages: CapturedFeedPage[],
  elapsedMs: number,
  limits: AcquisitionSafetyLimits = DEFAULT_ACQUISITION_LIMITS,
): ContinuationDecision {
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

/**
 * Decide whether continuation is needed before any real feed page has been
 * captured yet — the brief window right after initial page load where only
 * a raw `/api/project` response may exist. Fails loudly (`abort`) rather
 * than silently defaulting to "done" when that response is missing the
 * fields this decision depends on: a live capture (0905, Tron Arc 2.0)
 * showed a differently-shaped sibling endpoint (`/pinned-clips`) briefly
 * misidentified as the project response, whose absent `clip_count`/
 * `project_clips` silently evaluated to `0 > 0 = false` and cut the
 * acquisition short after a single page.
 */
export function decideInitialContinuation(
  projectResponse: unknown,
  feedPagesLength: number,
): { action: "continue" | "stop" | "abort"; reason?: string } {
  if (feedPagesLength > 0) return { action: "continue" };
  if (projectResponse == null) return { action: "continue" };
  const pr = projectResponse as { clip_count?: unknown; project_clips?: unknown };
  if (typeof pr.clip_count !== "number" || !Array.isArray(pr.project_clips)) {
    return {
      action: "abort",
      reason: "Captured /api/project response is missing clip_count or project_clips — possibly a misidentified endpoint",
    };
  }
  return { action: pr.clip_count > pr.project_clips.length ? "continue" : "stop" };
}

/**
 * The driver's live pagination state: what cursor the NEXT accepted
 * `/api/feed/v3` response must carry. `"awaiting-bootstrap"` means no
 * logical page has been accepted yet (a genuine `cursor:null` capture is
 * the only thing that can satisfy it); `"pending"` names the exact cursor
 * a continuation call must echo; `"terminal"` means pagination is done.
 */
export type ExpectedCursorState =
  | { kind: "awaiting-bootstrap" }
  | { kind: "pending"; cursor: string }
  | { kind: "terminal" };

export type FeedCursorMatchResult =
  | { matched: false }
  | { matched: true; valid: false; reason: string }
  | { matched: true; valid: true; next: ExpectedCursorState };

/**
 * Decide whether ONE captured `/api/feed/v3` response is the specific
 * page the driver is currently waiting for, given its own outgoing
 * request's `cursor`. This is the core race fix (0905, second pass):
 * pagination must advance by a matched request/response pair — the
 * cursor the app itself sent, echoed back in the request body Playwright
 * observed — never by "whichever response was captured most recently."
 *
 * A response whose cursor doesn't match `expected` is not an error: it's
 * either the redundant `cursor:null` bootstrap call Suno fires alongside
 * a real `/api/project` response (already handled by keeping only one
 * bootstrap page in {@link toFeedOnlyCaptures}), a stale retry, or an
 * out-of-order arrival — `matched:false` tells the caller to ignore it
 * and keep waiting. A response whose cursor DOES match but whose body is
 * malformed or can't yield a next cursor is a genuine validation failure
 * (`matched:true, valid:false`) and should abort that workspace rather
 * than silently stall.
 */
export function matchFeedResponseToExpectedCursor(
  expected: ExpectedCursorState,
  cursorUsed: string | null,
  response: unknown,
): FeedCursorMatchResult {
  if (expected.kind === "terminal") return { matched: false };
  const wanted = expected.kind === "awaiting-bootstrap" ? null : expected.cursor;
  if (cursorUsed !== wanted) return { matched: false };

  const body = response as { clips?: unknown; has_more?: unknown } | null | undefined;
  if (!Array.isArray(body?.clips) || typeof body?.has_more !== "boolean") {
    return {
      matched: true,
      valid: false,
      reason: `Matched feed/v3 response (cursor=${cursorUsed}) has an unexpected shape (missing clips[] or has_more)`,
    };
  }
  if (body.has_more === false) return { matched: true, valid: true, next: { kind: "terminal" } };

  const clips = body.clips as Array<{ id?: unknown }>;
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

/** Hard cap on retries for a single cursor before giving up on the whole workspace. */
export const MAX_CURSOR_RETRIES = 3;

/** Backoff before each successive retry of the same cursor (index 0 = retry 1). */
export const CURSOR_RETRY_BACKOFF_MS = [2000, 5000, 10000];

export type CursorRetryDecision =
  | { action: "retry"; nextRetryCount: number; backoffMs: number }
  | { action: "exhausted" };

/**
 * Decide what to do when a captured `/api/feed/v3` response's cursor
 * matched what was expected, but its body was malformed — observed live
 * (0906, the `default` pseudo-workspace's ~46-page crawl) as intermittent
 * backend instability under deep pagination, not a deterministic break:
 * two live attempts both hit this class of failure at different cursors
 * and different depths. Never advances pagination or invents a next
 * cursor on a malformed body — this only decides whether there's budget
 * left to wait and ask for the SAME cursor again.
 */
export function decideCursorRetryOutcome(
  retryCountSoFar: number,
  maxRetries: number = MAX_CURSOR_RETRIES,
): CursorRetryDecision {
  if (retryCountSoFar >= maxRetries) return { action: "exhausted" };
  const nextRetryCount = retryCountSoFar + 1;
  const backoffMs = CURSOR_RETRY_BACKOFF_MS[Math.min(nextRetryCount - 1, CURSOR_RETRY_BACKOFF_MS.length - 1)];
  return { action: "retry", nextRetryCount, backoffMs };
}

/**
 * Establish the pagination state to continue from when NO genuine
 * `cursor:null` feed bootstrap was captured — only a raw `/api/project`
 * response. Reuses {@link decideInitialContinuation} (unchanged) for the
 * continue/stop/abort call, then derives the cursor a continuation call
 * must echo from the project response's own last clip.
 */
export function deriveInitialExpectedCursor(
  projectResponse: unknown,
): { ok: true; expected: ExpectedCursorState } | { ok: false; reason: string } {
  const initial = decideInitialContinuation(projectResponse, 0);
  if (initial.action === "abort") return { ok: false, reason: initial.reason! };
  if (initial.action === "stop") return { ok: true, expected: { kind: "terminal" } };

  const pr = projectResponse as { project_clips?: Array<{ clip?: { id?: unknown } }> };
  const clips = pr.project_clips ?? [];
  const lastId = clips.length > 0 ? clips[clips.length - 1]?.clip?.id : undefined;
  if (typeof lastId !== "string") {
    return {
      ok: false,
      reason: "Captured /api/project response's clips are missing usable id fields — cannot derive next cursor",
    };
  }
  return { ok: true, expected: { kind: "pending", cursor: lastId } };
}

/**
 * Detect an obvious pagination-loop symptom the driver can check cheaply
 * between polls: the same cursor being sent twice, or a page repeating
 * the previous page's last clip id as its own first clip id (a stalled
 * scroll re-firing the same request). This is a lightweight pre-check —
 * the authoritative dedupe/leakage checks still happen in the existing
 * collector once these captures are handed off to it.
 */
export function detectObviousStall(pages: CapturedFeedPage[]): string | null {
  if (pages.length < 2) return null;
  const prev = pages[pages.length - 2];
  const curr = pages[pages.length - 1];
  if (prev.cursorUsed != null && curr.cursorUsed != null && prev.cursorUsed === curr.cursorUsed) {
    return `Same cursor (${curr.cursorUsed}) used on consecutive captured pages — likely a stalled/duplicate capture`;
  }
  const prevClips = prev.response?.clips as Array<{ id?: string }> | undefined;
  const currClips = curr.response?.clips as Array<{ id?: string }> | undefined;
  if (prevClips?.length && currClips?.length && prevClips[0]?.id === currClips[0]?.id) {
    return `Consecutive captured pages share the same first clip id (${currClips[0]?.id}) — likely a duplicate capture`;
  }
  return null;
}

export interface WorkspaceCaptureBundle {
  workspaceId: string;
  workspaceName?: string;
  projectResponse: unknown | null;
  feedPages: CapturedFeedPage[];
  /**
   * True only when every captured request's URL was directly observed
   * from the network layer (never inferred from response body shape
   * alone). The driver script sets this — this module just carries it
   * through.
   */
  provenanceConfirmed: boolean;
}

interface RawProjectResponse {
  clip_count?: number;
  project_clips?: Array<{ clip: unknown }>;
}

/**
 * Always assemble a FEED-ONLY capture list, discarding
 * GET /api/project/{wid} as an authority — even when one was captured.
 * Two things observed live (0905, Tron Arc 2.0) justify this:
 *
 *  1. Suno's workspace UI fires a redundant POST /api/feed/v3 with
 *     cursor:null in parallel with GET /api/project/{wid} on initial
 *     load, returning the identical first-page clips a second time.
 *     A human copying bodies out of DevTools never happened to notice
 *     that parallel call; full network capture sees it every time. If
 *     it fires, that captured feed page IS the real feed-only
 *     bootstrap page — nothing needs to be synthesized.
 *  2. /api/project's own `clip_count` field has been directly observed
 *     to be stale by exactly one clip relative to what pagination
 *     actually returns before a genuine has_more:false. Every
 *     successful real-world ingestion in this project (40+ workspaces,
 *     hundreds of clips, prior to this automation existing) used the
 *     feed-only capture shape for exactly this reason — its pass
 *     criterion depends only on reaching a genuine has_more:false, not
 *     on cross-checking Suno's own count metadata. This is not the
 *     collector being loosened; feed-only mode already existed and is
 *     simply the mode this driver always targets, because it is the
 *     proven one.
 *
 * If no genuine null-cursor feed page was captured (Suno fired only
 * /api/project this time), one is synthesized here from the literal,
 * verbatim project_clips[].clip entries — no clip data is fabricated,
 * only the {clips, has_more} envelope Suno's own /api/feed/v3 would
 * have used is reconstructed around real clips. Its has_more guess
 * (from clip_count) is never load-bearing: it only decides whether the
 * acquisition loop asks for one more page, and the collector's own
 * has_more/zero-clips checks fail safely if that guess is wrong.
 */
export function toFeedOnlyCaptures(
  projectResponse: unknown | null,
  feedPages: CapturedFeedPage[],
): CapturedFeedPage[] {
  const hasBootstrap = feedPages.some((p) => p.cursorUsed == null);
  if (hasBootstrap) {
    // Keep exactly one null-cursor page (the first) — a workspace has
    // exactly one true feed-only bootstrap; any further null-cursor
    // entries are the same redundant-parallel-call artifact repeating.
    let seenBootstrap = false;
    return feedPages.filter((p) => {
      if (p.cursorUsed != null) return true;
      if (seenBootstrap) return false;
      seenBootstrap = true;
      return true;
    });
  }
  const project = projectResponse as RawProjectResponse | null;
  const clips = project?.project_clips?.map((pc) => pc.clip) ?? [];
  if (clips.length === 0) return feedPages; // nothing usable to synthesize from
  const hasMoreGuess = typeof project?.clip_count === "number" ? project.clip_count > clips.length : feedPages.length > 0;
  return [{ cursorUsed: null, response: { clips: clips as unknown[], has_more: hasMoreGuess } }, ...feedPages];
}

/**
 * Assemble the exact capture-wrapper JSON shape the existing
 * merge pipeline (scripts/mergeSunoWorkspaceCollection.mjs) expects.
 * Always emits projectResponse: null and a feed-only feedResponses list
 * via toFeedOnlyCaptures() — see that function's header for why. Does
 * not otherwise validate pagination integrity itself — that authority
 * stays entirely with collectSunoWorkspaceFromCaptures() in
 * sunoWorkspaceFeed.ts, invoked downstream by the merge script.
 */
export function buildCaptureWrapper(bundle: WorkspaceCaptureBundle): {
  workspaceId: string;
  workspaceName?: string;
  projectResponse: unknown | null;
  feedResponses: Array<{ cursor: string | null; response: unknown }>;
  provenanceConfirmed: boolean;
} {
  const feedPages = toFeedOnlyCaptures(bundle.projectResponse, bundle.feedPages);
  return {
    workspaceId: bundle.workspaceId,
    workspaceName: bundle.workspaceName,
    projectResponse: null,
    feedResponses: feedPages.map((p) => ({ cursor: p.cursorUsed, response: p.response })),
    provenanceConfirmed: bundle.provenanceConfirmed,
  };
}

/** Filesystem-safe slug for a workspace, used only for the capture filename. */
export function slugifyWorkspaceName(name: string | undefined, fallbackId: string): string {
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
