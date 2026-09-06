import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACQUISITION_LIMITS,
  SunoWorkspaceAcquisitionError,
  buildCaptureWrapper,
  decideInitialContinuation,
  decideNextAction,
  deriveInitialExpectedCursor,
  detectObviousStall,
  matchFeedResponseToExpectedCursor,
  toFeedOnlyCaptures,
  isSunoFeedV3RequestUrl,
  isSunoProjectRequestUrl,
  parseSunoWorkspaceId,
  slugifyWorkspaceName,
} from "./sunoWorkspaceAcquisition";

const WID = "42a9b447-77f8-4852-b551-1294522487c6";

describe("parseSunoWorkspaceId", () => {
  it("extracts wid from a suno.com/create?wid=... URL", () => {
    expect(parseSunoWorkspaceId(`https://suno.com/create?wid=${WID}`)).toBe(WID);
  });

  it("extracts wid from a URL with extra query params in any order", () => {
    expect(parseSunoWorkspaceId(`https://suno.com/create?tab=workspace&wid=${WID}&foo=bar`)).toBe(WID);
  });

  it("accepts a bare workspace id", () => {
    expect(parseSunoWorkspaceId(WID)).toBe(WID);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseSunoWorkspaceId(`  ${WID}  `)).toBe(WID);
  });

  it("throws when no UUID is present anywhere", () => {
    expect(() => parseSunoWorkspaceId("https://suno.com/create?tab=workspace")).toThrow(SunoWorkspaceAcquisitionError);
  });

  it("throws on an empty string", () => {
    expect(() => parseSunoWorkspaceId("")).toThrow(SunoWorkspaceAcquisitionError);
  });

  it("accepts the literal 'default' pseudo-workspace id as a bare string (regression: 0906 unassigned-clips bucket)", () => {
    expect(parseSunoWorkspaceId("default")).toBe("default");
  });

  it("accepts 'default' from a suno.com/create?wid=default URL", () => {
    expect(parseSunoWorkspaceId("https://suno.com/create?wid=default")).toBe("default");
  });

  it("rejects an arbitrary non-UUID, non-'default' bare string", () => {
    expect(() => parseSunoWorkspaceId("not-a-real-workspace-id")).toThrow(SunoWorkspaceAcquisitionError);
  });

  it("rejects an arbitrary non-UUID, non-'default' wid query value", () => {
    expect(() => parseSunoWorkspaceId("https://suno.com/create?wid=some-other-string")).toThrow(SunoWorkspaceAcquisitionError);
  });
});

describe("isSunoProjectRequestUrl / isSunoFeedV3RequestUrl", () => {
  it("matches the real /api/project/{wid} shape", () => {
    expect(isSunoProjectRequestUrl(`https://studio-api-prod.suno.com/api/project/${WID}`)).toBe(true);
  });

  it("matches /api/project/{wid} with trailing query params", () => {
    expect(isSunoProjectRequestUrl(`https://studio-api-prod.suno.com/api/project/${WID}?foo=bar`)).toBe(true);
  });

  it("does not match unrelated project-ish paths", () => {
    expect(isSunoProjectRequestUrl("https://studio-api-prod.suno.com/api/projects")).toBe(false);
    expect(isSunoProjectRequestUrl("https://studio-api-prod.suno.com/api/project/not-a-uuid")).toBe(false);
  });

  it("does not match the sibling /pinned-clips endpoint (regression: Tron Arc 2.0 0905 live run)", () => {
    expect(isSunoProjectRequestUrl(`https://studio-api-prod.suno.com/api/project/${WID}/pinned-clips`)).toBe(false);
  });

  it("matches the literal /api/project/default pseudo-workspace endpoint (regression: 0906 unassigned-clips bucket)", () => {
    expect(isSunoProjectRequestUrl("https://studio-api-prod.suno.com/api/project/default")).toBe(true);
  });

  it("matches /api/project/default with trailing query params", () => {
    expect(isSunoProjectRequestUrl("https://studio-api-prod.suno.com/api/project/default?foo=bar")).toBe(true);
  });

  it("does not match the sibling /pinned-clips endpoint for the default bucket either", () => {
    expect(isSunoProjectRequestUrl("https://studio-api-prod.suno.com/api/project/default/pinned-clips")).toBe(false);
  });

  it("does not loosen to arbitrary non-UUID, non-'default' project ids", () => {
    expect(isSunoProjectRequestUrl("https://studio-api-prod.suno.com/api/project/defaults")).toBe(false);
    expect(isSunoProjectRequestUrl("https://studio-api-prod.suno.com/api/project/some-other-string")).toBe(false);
  });

  it("matches the real /api/feed/v3 shape", () => {
    expect(isSunoFeedV3RequestUrl("https://studio-api-prod.suno.com/api/feed/v3")).toBe(true);
  });

  it("does not match a different feed version", () => {
    expect(isSunoFeedV3RequestUrl("https://studio-api-prod.suno.com/api/feed/v2")).toBe(false);
  });
});

function page(hasMore: boolean, cursorUsed: string | null = null, clips: Array<{ id: string }> = [{ id: "a" }]) {
  return { cursorUsed, response: { clips, has_more: hasMore, next_cursor: null } };
}

describe("decideNextAction", () => {
  it("continues on the very first (empty) page list", () => {
    expect(decideNextAction([], 0)).toEqual({ action: "continue" });
  });

  it("stops once the latest page has has_more:false", () => {
    expect(decideNextAction([page(true), page(false)], 100)).toEqual({ action: "stop", reason: "terminal" });
  });

  it("continues while has_more stays true and under both caps", () => {
    expect(decideNextAction([page(true)], 100)).toEqual({ action: "continue" });
  });

  it("aborts once the continuation cap is exceeded", () => {
    const pages = Array.from({ length: 51 }, () => page(true));
    const result = decideNextAction(pages, 0, { maxContinuations: 50, maxDurationMs: 999_999 });
    expect(result.action).toBe("abort");
  });

  it("aborts once the time budget is exceeded", () => {
    const result = decideNextAction([page(true)], 10_000, { maxContinuations: 50, maxDurationMs: 5_000 });
    expect(result.action).toBe("abort");
  });

  it("aborts on a malformed last response", () => {
    const malformed = [{ cursorUsed: null, response: { clips: "not-an-array", has_more: true } as never }];
    const result = decideNextAction(malformed, 0);
    expect(result.action).toBe("abort");
  });

  it("uses DEFAULT_ACQUISITION_LIMITS when none are supplied", () => {
    expect(DEFAULT_ACQUISITION_LIMITS.maxContinuations).toBeGreaterThan(0);
    expect(DEFAULT_ACQUISITION_LIMITS.maxDurationMs).toBeGreaterThan(0);
  });
});

describe("decideInitialContinuation", () => {
  it("continues once real feed pages already exist, deferring to decideNextAction", () => {
    expect(decideInitialContinuation({ clip_count: 1, project_clips: [] }, 1)).toEqual({ action: "continue" });
    expect(decideInitialContinuation(null, 1)).toEqual({ action: "continue" });
  });

  it("continues when nothing has been captured yet", () => {
    expect(decideInitialContinuation(null, 0)).toEqual({ action: "continue" });
  });

  it("stops when the project response's clip_count matches project_clips.length", () => {
    const result = decideInitialContinuation({ clip_count: 2, project_clips: [{ clip: {} }, { clip: {} }] }, 0);
    expect(result).toEqual({ action: "stop" });
  });

  it("continues when the project response's clip_count exceeds project_clips.length", () => {
    const result = decideInitialContinuation({ clip_count: 150, project_clips: [{ clip: {} }] }, 0);
    expect(result).toEqual({ action: "continue" });
  });

  it("aborts rather than silently defaulting to done when clip_count is missing (regression: /pinned-clips misidentification)", () => {
    const result = decideInitialContinuation({ project_clips_len: undefined }, 0);
    expect(result.action).toBe("abort");
  });

  it("aborts when project_clips is missing or not an array", () => {
    const result = decideInitialContinuation({ clip_count: 5 }, 0);
    expect(result.action).toBe("abort");
  });
});

describe("matchFeedResponseToExpectedCursor", () => {
  const bootstrap = { kind: "awaiting-bootstrap" as const };
  const pending = (cursor: string) => ({ kind: "pending" as const, cursor });
  const terminal = { kind: "terminal" as const };

  it("accepts a genuine cursor:null bootstrap response while awaiting bootstrap", () => {
    const result = matchFeedResponseToExpectedCursor(bootstrap, null, { clips: [{ id: "a" }], has_more: true });
    expect(result).toEqual({ matched: true, valid: true, next: { kind: "pending", cursor: "a" } });
  });

  it("ignores a real-cursor response while still awaiting bootstrap (out-of-order arrival)", () => {
    const result = matchFeedResponseToExpectedCursor(bootstrap, "c1", { clips: [{ id: "a" }], has_more: true });
    expect(result).toEqual({ matched: false });
  });

  it("ignores the redundant cursor:null bootstrap call once a real continuation is already expected (regression: Tron Arc 2.0 0905 duplicate-UUID bug)", () => {
    const result = matchFeedResponseToExpectedCursor(pending("real-cursor-1"), null, {
      clips: [{ id: "dup" }],
      has_more: true,
    });
    expect(result).toEqual({ matched: false });
  });

  it("ignores a response whose cursor doesn't match the one currently pending (stale retry or out-of-order arrival)", () => {
    const result = matchFeedResponseToExpectedCursor(pending("expected-cursor"), "some-other-cursor", {
      clips: [{ id: "x" }],
      has_more: true,
    });
    expect(result).toEqual({ matched: false });
  });

  it("accepts a matching pending-cursor response and derives the next expected cursor", () => {
    const result = matchFeedResponseToExpectedCursor(pending("c1"), "c1", {
      clips: [{ id: "x" }, { id: "y" }],
      has_more: true,
    });
    expect(result).toEqual({ matched: true, valid: true, next: { kind: "pending", cursor: "y" } });
  });

  it("accepts a matching response with has_more:false and transitions to terminal", () => {
    const result = matchFeedResponseToExpectedCursor(pending("c6"), "c6", { clips: [{ id: "last" }], has_more: false });
    expect(result).toEqual({ matched: true, valid: true, next: { kind: "terminal" } });
  });

  it("never matches anything once terminal", () => {
    const result = matchFeedResponseToExpectedCursor(terminal, null, { clips: [], has_more: false });
    expect(result).toEqual({ matched: false });
  });

  it("flags a matched-but-malformed response as invalid rather than silently ignoring it", () => {
    const result = matchFeedResponseToExpectedCursor(pending("c1"), "c1", { clips: "not-an-array", has_more: true });
    expect(result.matched).toBe(true);
    expect((result as { valid: boolean }).valid).toBe(false);
  });

  it("flags a matched has_more:true response with zero clips as invalid (cannot derive next cursor)", () => {
    const result = matchFeedResponseToExpectedCursor(pending("c1"), "c1", { clips: [], has_more: true });
    expect(result).toEqual({
      matched: true,
      valid: false,
      reason: expect.stringMatching(/zero clips/i),
    });
  });

  it("flags a matched has_more:true response whose last clip has no usable id as invalid", () => {
    const result = matchFeedResponseToExpectedCursor(pending("c1"), "c1", { clips: [{ id: 12345 }], has_more: true });
    expect(result.matched).toBe(true);
    expect((result as { valid: boolean }).valid).toBe(false);
  });
});

describe("deriveInitialExpectedCursor", () => {
  it("derives a pending cursor from the project response's last clip when more clips are expected", () => {
    const projectResponse = {
      clip_count: 150,
      project_clips: [{ clip: { id: "a" } }, { clip: { id: "b" } }],
    };
    expect(deriveInitialExpectedCursor(projectResponse)).toEqual({ ok: true, expected: { kind: "pending", cursor: "b" } });
  });

  it("derives terminal when the project response's clip_count already matches project_clips.length", () => {
    const projectResponse = { clip_count: 1, project_clips: [{ clip: { id: "only" } }] };
    expect(deriveInitialExpectedCursor(projectResponse)).toEqual({ ok: true, expected: { kind: "terminal" } });
  });

  it("fails rather than guessing when clip_count/project_clips are missing (regression: /pinned-clips misidentification)", () => {
    const result = deriveInitialExpectedCursor({ project_clips_len: undefined });
    expect(result.ok).toBe(false);
  });

  it("fails rather than guessing when project_clips entries have no usable clip id", () => {
    const result = deriveInitialExpectedCursor({ clip_count: 5, project_clips: [{ clip: {} }] });
    expect(result.ok).toBe(false);
  });
});

describe("detectObviousStall", () => {
  it("returns null with fewer than two pages", () => {
    expect(detectObviousStall([])).toBeNull();
    expect(detectObviousStall([page(true, "c1")])).toBeNull();
  });

  it("flags a repeated cursor across consecutive pages", () => {
    const result = detectObviousStall([page(true, "c1"), page(true, "c1")]);
    expect(result).toMatch(/same cursor/i);
  });

  it("flags a repeated first clip id across consecutive pages", () => {
    const p1 = page(true, "c1", [{ id: "same-id" }]);
    const p2 = page(true, "c2", [{ id: "same-id" }]);
    const result = detectObviousStall([p1, p2]);
    expect(result).toMatch(/same first clip id/i);
  });

  it("returns null for two genuinely different pages", () => {
    const p1 = page(true, "c1", [{ id: "id-1" }]);
    const p2 = page(true, "c2", [{ id: "id-2" }]);
    expect(detectObviousStall([p1, p2])).toBeNull();
  });
});

describe("toFeedOnlyCaptures", () => {
  const projectResponse = { id: WID, clip_count: 150, project_clips: [] };

  it("passes feed-only pages through unchanged when there is no project response", () => {
    const pages = [page(true, null), page(true, "c1")];
    expect(toFeedOnlyCaptures(null, pages)).toEqual(pages);
  });

  it("keeps the single genuine bootstrap page unchanged even when a project response also exists (the observed Tron Arc 2.0 case)", () => {
    const bootstrap = page(true, null, [{ id: "same-as-project-page-1" }]);
    const realContinuation = page(true, "c1", [{ id: "real-clip" }]);
    const terminal = page(false, "c2", [{ id: "last-clip" }]);
    const result = toFeedOnlyCaptures(projectResponse, [bootstrap, realContinuation, terminal]);
    expect(result).toEqual([bootstrap, realContinuation, terminal]);
  });

  it("keeps only the first cursor:null page when more than one somehow appears", () => {
    const pages = [page(true, null), page(true, null), page(true, "c1")];
    const result = toFeedOnlyCaptures(projectResponse, pages);
    expect(result).toEqual([pages[0], pages[2]]);
  });

  it("is a no-op when every page already has a non-null cursor and no synthesis is needed", () => {
    const pages = [page(true, "c1"), page(false, "c2")];
    expect(toFeedOnlyCaptures(projectResponse, pages)).toEqual(pages);
  });

  it("synthesizes a bootstrap page from the literal project_clips[] when no feed page was captured at all", () => {
    const clipA = { id: "a" };
    const clipB = { id: "b" };
    const project = { clip_count: 5, project_clips: [{ clip: clipA }, { clip: clipB }] };
    const result = toFeedOnlyCaptures(project, []);
    expect(result).toEqual([{ cursorUsed: null, response: { clips: [clipA, clipB], has_more: true } }]);
  });

  it("synthesized bootstrap has_more is false once project_clips already covers the full clip_count", () => {
    const project = { clip_count: 1, project_clips: [{ clip: { id: "only" } }] };
    const result = toFeedOnlyCaptures(project, []);
    expect(result[0].response.has_more).toBe(false);
  });

  it("returns feedPages unchanged when there is nothing to synthesize from (no project response, no feed pages)", () => {
    expect(toFeedOnlyCaptures(null, [])).toEqual([]);
  });
});

describe("buildCaptureWrapper", () => {
  it("always emits projectResponse: null, even when a raw project response was captured", () => {
    const wrapper = buildCaptureWrapper({
      workspaceId: WID,
      workspaceName: "→ Test Workspace",
      projectResponse: { id: WID, clip_count: 150, project_clips: [] },
      feedPages: [{ cursorUsed: "cursor-1", response: { clips: [], has_more: false } }],
      provenanceConfirmed: true,
    });
    expect(wrapper.projectResponse).toBeNull();
    expect(wrapper.workspaceId).toBe(WID);
    expect(wrapper.workspaceName).toBe("→ Test Workspace");
    expect(wrapper.feedResponses).toEqual([{ cursor: "cursor-1", response: { clips: [], has_more: false } }]);
  });

  it("produces a feed-only wrapper (projectResponse: null, first cursor null)", () => {
    const wrapper = buildCaptureWrapper({
      workspaceId: WID,
      projectResponse: null,
      feedPages: [{ cursorUsed: null, response: { clips: [{ id: "x" }], has_more: false } }],
      provenanceConfirmed: true,
    });
    expect(wrapper.projectResponse).toBeNull();
    expect(wrapper.feedResponses[0].cursor).toBeNull();
  });

  it("keeps the single genuine bootstrap page when a redundant project response also exists (regression: Tron Arc 2.0 0905 live run)", () => {
    const wrapper = buildCaptureWrapper({
      workspaceId: WID,
      projectResponse: { id: WID, clip_count: 150, project_clips: [] },
      feedPages: [
        { cursorUsed: null, response: { clips: [{ id: "bootstrap" }], has_more: true } },
        { cursorUsed: "c1", response: { clips: [{ id: "real" }], has_more: false } },
      ],
      provenanceConfirmed: true,
    });
    expect(wrapper.feedResponses).toEqual([
      { cursor: null, response: { clips: [{ id: "bootstrap" }], has_more: true } },
      { cursor: "c1", response: { clips: [{ id: "real" }], has_more: false } },
    ]);
  });
});

describe("slugifyWorkspaceName", () => {
  it("slugifies a plain name", () => {
    expect(slugifyWorkspaceName("→ RX-0 - Ink Doodles", WID)).toBe("rx-0-ink-doodles");
  });

  it("falls back to the workspace id when the name is undefined", () => {
    expect(slugifyWorkspaceName(undefined, WID)).toBe(WID);
  });

  it("falls back to the workspace id when the name has no usable characters", () => {
    expect(slugifyWorkspaceName("→→→", WID)).toBe(WID);
  });
});
