import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  buildSunoFeedV3Payload,
  classifySunoWorkspaceClip,
  collectSunoWorkspace,
  collectSunoWorkspaceFromCaptures,
  SunoWorkspaceCollectionError,
  type SunoFeedV3Response,
  type SunoProjectResponse,
  type SunoWorkspaceClip,
} from "./sunoWorkspaceFeed";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "__fixtures__");

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf-8")) as T;
}

const ARTICLE_HUNTER_WID = "a34f779f-e4ce-4985-8f5d-93443cb23cc3";
const TRON_ARC_WID = "925ee299-16c0-4fab-8a4f-6868403a66b3";

describe("buildSunoFeedV3Payload", () => {
  it("matches the literal captured request payload exactly", () => {
    const captured = loadFixture<Record<string, unknown>>("suno-feed-v3-continuation-article-hunter-request.json");
    const built = buildSunoFeedV3Payload(ARTICLE_HUNTER_WID, "a8f41a77-d5a8-4da6-8894-34c1f160d440");
    expect(built).toEqual(captured);
  });
});

describe("collectSunoWorkspace — real fixture replay", () => {
  it("reproduces the fully-verified Article Hunter sequence (20 + 18, single continuation)", async () => {
    const projectResponse = loadFixture<SunoProjectResponse>("suno-workspace-project-article-hunter-page1.json");
    const feedResponse = loadFixture<SunoFeedV3Response>("suno-feed-v3-continuation-article-hunter.json");

    const result = await collectSunoWorkspace(
      ARTICLE_HUNTER_WID,
      async (wid) => {
        expect(wid).toBe(ARTICLE_HUNTER_WID);
        return projectResponse;
      },
      async (payload) => {
        expect(payload.cursor).toBe("a8f41a77-d5a8-4da6-8894-34c1f160d440");
        expect(payload.filters.workspace.workspaceId).toBe(ARTICLE_HUNTER_WID);
        return feedResponse;
      },
    );

    expect(result.summary.initialPageCount).toBe(20);
    expect(result.summary.continuationCallCount).toBe(1);
    expect(result.summary.clipsPerContinuationCall).toEqual([18]);
    expect(result.summary.distinctUuidCount).toBe(38);
    expect(result.summary.duplicateUuidCount).toBe(0);
    expect(result.summary.crossWorkspaceLeakageCount).toBe(0);
    expect(result.summary.finalHasMore).toBe(false);
    expect(result.summary.pass).toBe(true);
    expect(result.clips).toHaveLength(38);
  });

  it("reproduces the Tron Arc 2.0 final page in isolation (9 clips, has_more:false, no continuation needed)", async () => {
    const finalPage = loadFixture<SunoFeedV3Response>("suno-feed-v3-tron-arc-call8-final-page.json");
    // A synthetic single-page project response standing in for "the whole
    // workspace fit in one call" case — proves the collector correctly
    // skips /api/feed/v3 entirely when clip_count <= the first page.
    const projectResponse: SunoProjectResponse = {
      id: TRON_ARC_WID,
      name: "→ Tron Arc 2.0",
      project_clips: finalPage.clips.map((clip, i) => ({ clip, relative_index: i })),
      clip_count: finalPage.clips.length,
      current_page: 1,
    };

    const result = await collectSunoWorkspace(
      TRON_ARC_WID,
      async () => projectResponse,
      async () => {
        throw new Error("should not be called — whole workspace fit on page 1");
      },
    );

    expect(result.summary.initialPageCount).toBe(9);
    expect(result.summary.continuationCallCount).toBe(0);
    expect(result.summary.distinctUuidCount).toBe(9);
    expect(result.summary.pass).toBe(true);
    // Real, observed schema variance from this batch: Tron Arc's clips
    // report v4.5 (no plus)/chirp-auk, distinct from Article Hunter's
    // v4.5+/chirp-bluejay — classification must come from the clip, not
    // the workspace's manual "4.5" label.
    expect(result.summary.modelVersionDistribution["v4.5::chirp-auk"]).toBe(9);
  });
});

describe("collectSunoWorkspace — synthetic multi-continuation and abort paths", () => {
  function makeClip(id: string, projectId: string, overrides: Partial<SunoWorkspaceClip> = {}): SunoWorkspaceClip {
    return {
      id,
      title: `Song ${id}`,
      major_model_version: "v4.5+",
      model_name: "chirp-bluejay",
      project: { id: projectId },
      metadata: { prompt: "", tags: "lofi" },
      ...overrides,
    };
  }

  it("chains three continuation calls correctly and stops exactly at has_more:false", async () => {
    const wid = "wid-multi";
    const page1 = [makeClip("c1", wid), makeClip("c2", wid)];
    const page2 = [makeClip("c3", wid), makeClip("c4", wid)];
    const page3 = [makeClip("c5", wid)];

    const projectResponse: SunoProjectResponse = {
      id: wid,
      project_clips: page1.map((clip) => ({ clip })),
      clip_count: 5,
    };

    let call = 0;
    const result = await collectSunoWorkspace(
      wid,
      async () => projectResponse,
      async (payload) => {
        call++;
        if (call === 1) {
          expect(payload.cursor).toBe("c2");
          return { clips: page2, has_more: true, next_cursor: "c4" };
        }
        if (call === 2) {
          expect(payload.cursor).toBe("c4");
          return { clips: page3, has_more: false, next_cursor: null };
        }
        throw new Error("unexpected extra call");
      },
    );

    expect(result.summary.continuationCallCount).toBe(2);
    expect(result.summary.distinctUuidCount).toBe(5);
    expect(result.summary.pass).toBe(true);
    expect(result.clips.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("throws when a duplicate UUID appears across pages", async () => {
    const wid = "wid-dup";
    const projectResponse: SunoProjectResponse = {
      id: wid,
      project_clips: [{ clip: makeClip("c1", wid) }],
      clip_count: 2,
    };
    await expect(
      collectSunoWorkspace(
        wid,
        async () => projectResponse,
        async () => ({ clips: [makeClip("c1", wid)], has_more: false }),
      ),
    ).rejects.toThrow(SunoWorkspaceCollectionError);
  });

  it("throws when a continuation would leave the cursor stuck (structurally the same failure as a repeated clip id, since the cursor IS the last-seen clip's id)", async () => {
    const wid = "wid-stuck";
    const projectResponse: SunoProjectResponse = {
      id: wid,
      project_clips: [{ clip: makeClip("c1", wid) }],
      clip_count: 3,
    };
    await expect(
      collectSunoWorkspace(
        wid,
        async () => projectResponse,
        // Server claims more data but hands back the same clip already seen —
        // caught by the duplicate-UUID guard before the dedicated
        // stuck-cursor check ever runs, which is the correct outcome either way.
        async () => ({ clips: [makeClip("c1", wid)], has_more: true, next_cursor: "c1" }),
      ),
    ).rejects.toThrow(SunoWorkspaceCollectionError);
  });

  it("throws when the server's next_cursor disagrees with the last returned clip.id", async () => {
    const wid = "wid-mismatch";
    const projectResponse: SunoProjectResponse = {
      id: wid,
      project_clips: [{ clip: makeClip("c1", wid) }],
      clip_count: 3,
    };
    await expect(
      collectSunoWorkspace(
        wid,
        async () => projectResponse,
        async () => ({ clips: [makeClip("c2", wid)], has_more: true, next_cursor: "not-c2" }),
      ),
    ).rejects.toThrow(/next_cursor does not match/);
  });

  it("throws when a continuation returns zero clips while has_more is true", async () => {
    const wid = "wid-empty";
    const projectResponse: SunoProjectResponse = {
      id: wid,
      project_clips: [{ clip: makeClip("c1", wid) }],
      clip_count: 3,
    };
    await expect(
      collectSunoWorkspace(
        wid,
        async () => projectResponse,
        async () => ({ clips: [], has_more: true }),
      ),
    ).rejects.toThrow(/zero clips/);
  });

  it("throws when total clips exceed the reported clip_count", async () => {
    const wid = "wid-over";
    const projectResponse: SunoProjectResponse = {
      id: wid,
      project_clips: [{ clip: makeClip("c1", wid) }],
      clip_count: 2,
    };
    await expect(
      collectSunoWorkspace(
        wid,
        async () => projectResponse,
        async () => ({ clips: [makeClip("c2", wid), makeClip("c3", wid)], has_more: false }),
      ),
    ).rejects.toThrow(/exceeded clip_count/);
  });

  it("counts (rather than crashes on) a cross-workspace clip, and fails the summary", async () => {
    const wid = "wid-leak";
    const projectResponse: SunoProjectResponse = {
      id: wid,
      project_clips: [{ clip: makeClip("c1", wid) }, { clip: makeClip("c2", "some-other-workspace") }],
      clip_count: 2,
    };
    const result = await collectSunoWorkspace(
      wid,
      async () => projectResponse,
      async () => ({ clips: [], has_more: false }),
    );
    expect(result.summary.crossWorkspaceLeakageCount).toBe(1);
    expect(result.summary.pass).toBe(false);
  });

  it("skips /api/feed/v3 entirely when clip_count already fits on page 1", async () => {
    const wid = "wid-small";
    const projectResponse: SunoProjectResponse = {
      id: wid,
      project_clips: [{ clip: makeClip("c1", wid) }, { clip: makeClip("c2", wid) }],
      clip_count: 2,
    };
    const result = await collectSunoWorkspace(
      wid,
      async () => projectResponse,
      async () => {
        throw new Error("should never be called for a fully-contained page");
      },
    );
    expect(result.summary.continuationCallCount).toBe(0);
    expect(result.summary.pass).toBe(true);
  });
});

describe("classifySunoWorkspaceClip", () => {
  it("distinguishes populated / empty / absent prompt states", () => {
    const populated = classifySunoWorkspaceClip({ id: "a", metadata: { prompt: "[Intro] ..." } });
    const empty = classifySunoWorkspaceClip({ id: "b", metadata: { prompt: "" } });
    const absent = classifySunoWorkspaceClip({ id: "c", metadata: {} });
    expect(populated.promptState).toBe("populated");
    expect(populated.prompt).toBe("[Intro] ...");
    expect(empty.promptState).toBe("empty");
    expect(empty.prompt).toBeUndefined();
    expect(absent.promptState).toBe("absent");
    expect(absent.prompt).toBeUndefined();
  });

  it("treats negative_tags as optional", () => {
    const withNegative = classifySunoWorkspaceClip({ id: "a", metadata: { negative_tags: "piano" } });
    const withoutNegative = classifySunoWorkspaceClip({ id: "b", metadata: {} });
    expect(withNegative.negativeTags).toBe("piano");
    expect(withoutNegative.negativeTags).toBeUndefined();
  });

  it("reads model/version from the clip itself, never assumes it", () => {
    const clip = classifySunoWorkspaceClip({
      id: "a",
      major_model_version: "v4.5",
      model_name: "chirp-auk",
    });
    expect(clip.majorModelVersion).toBe("v4.5");
    expect(clip.modelName).toBe("chirp-auk");
  });

  it("preserves the full raw clip object untouched", () => {
    const raw: SunoWorkspaceClip = { id: "a", title: "T", weirdUnknownField: 42 };
    const record = classifySunoWorkspaceClip(raw);
    expect(record.raw).toEqual(raw);
  });

  it("classifies a real fixture clip with an empty prompt correctly (Article Hunter's 'Music for Reading')", () => {
    const page1 = loadFixture<SunoProjectResponse>("suno-workspace-project-article-hunter-page1.json");
    const musicForReading = page1.project_clips.find((pc) => pc.clip.title === "Music for Reading")?.clip;
    expect(musicForReading).toBeDefined();
    const record = classifySunoWorkspaceClip(musicForReading!);
    expect(record.promptState).toBe("empty");
    expect(record.majorModelVersion).toBe("v4.5+");
  });
});

describe("collectSunoWorkspaceFromCaptures — project-anchored replay", () => {
  it("reproduces the same Article Hunter result as the live-fetch path", () => {
    const projectResponse = loadFixture<SunoProjectResponse>("suno-workspace-project-article-hunter-page1.json");
    const feedResponse = loadFixture<SunoFeedV3Response>("suno-feed-v3-continuation-article-hunter.json");

    const result = collectSunoWorkspaceFromCaptures(ARTICLE_HUNTER_WID, {
      projectResponse,
      feedCaptures: [{ cursor: "a8f41a77-d5a8-4da6-8894-34c1f160d440", response: feedResponse }],
    });

    expect(result.provenanceMode).toBe("project-anchored");
    expect(result.expectedClipCount).toBe(38);
    expect(result.derivedTerminalTotal).toBe(38);
    expect(result.summary.distinctUuidCount).toBe(38);
    expect(result.summary.pass).toBe(true);
  });
});

describe("collectSunoWorkspaceFromCaptures — feed-only bootstrap (no /api/project capture)", () => {
  function makeClip(id: string, projectId: string, overrides: Partial<SunoWorkspaceClip> = {}): SunoWorkspaceClip {
    return {
      id,
      title: `Song ${id}`,
      major_model_version: "v4.5",
      model_name: "chirp-auk",
      project: { id: projectId },
      metadata: { prompt: "", tags: "lofi" },
      ...overrides,
    };
  }

  it("accepts projectResponse:null with a single cursor:null feed capture, deriving (not asserting) the terminal total", () => {
    const wid = "wid-feed-only";
    const clips = [makeClip("a", wid), makeClip("b", wid), makeClip("c", wid)];

    const result = collectSunoWorkspaceFromCaptures(wid, {
      projectResponse: null,
      feedCaptures: [{ cursor: null, response: { clips, has_more: false } }],
      provenanceConfirmed: false,
    });

    expect(result.provenanceMode).toBe("feed-only");
    expect(result.expectedClipCount).toBeNull(); // never invented — no /api/project capture existed
    expect(result.derivedTerminalTotal).toBe(3); // only trusted because has_more:false was actually reached
    expect(result.provenanceConfirmed).toBe(false);
    expect(result.summary.distinctUuidCount).toBe(3);
    expect(result.summary.pass).toBe(true);
  });

  it("chains a feed-only bootstrap into a real continuation call", () => {
    const wid = "wid-feed-only-multi";
    const page1 = [makeClip("a", wid), makeClip("b", wid)];
    const page2 = [makeClip("c", wid)];

    const result = collectSunoWorkspaceFromCaptures(wid, {
      projectResponse: null,
      feedCaptures: [
        { cursor: null, response: { clips: page1, has_more: true, next_cursor: "b" } },
        { cursor: "b", response: { clips: page2, has_more: false } },
      ],
    });

    expect(result.summary.continuationCallCount).toBe(1);
    expect(result.summary.distinctUuidCount).toBe(3);
    expect(result.derivedTerminalTotal).toBe(3);
    expect(result.summary.pass).toBe(true);
  });

  it("never treats a derived terminal total as an authoritative clip_count for pass/fail purposes", () => {
    // Even though 2 clips arrive cleanly, has_more:true with no further
    // captures supplied must fail loudly rather than silently accepting
    // an incomplete feed-only capture as "done".
    const wid = "wid-incomplete";
    const clips = [makeClip("a", wid), makeClip("b", wid)];
    expect(() =>
      collectSunoWorkspaceFromCaptures(wid, {
        projectResponse: null,
        feedCaptures: [{ cursor: null, response: { clips, has_more: true, next_cursor: "b" } }],
      }),
    ).toThrow(SunoWorkspaceCollectionError);
  });

  it("still throws on duplicate UUIDs and cross-workspace leakage in feed-only mode", () => {
    const wid = "wid-feed-only-leak";
    const clips = [makeClip("a", wid), makeClip("b", "some-other-workspace")];
    const result = collectSunoWorkspaceFromCaptures(wid, {
      projectResponse: null,
      feedCaptures: [{ cursor: null, response: { clips, has_more: false } }],
    });
    expect(result.summary.crossWorkspaceLeakageCount).toBe(1);
    expect(result.summary.pass).toBe(false);
  });

  it("defaults provenanceConfirmed to false when omitted — the honest default", () => {
    const wid = "wid-default-provenance";
    const result = collectSunoWorkspaceFromCaptures(wid, {
      projectResponse: null,
      feedCaptures: [{ cursor: null, response: { clips: [makeClip("a", wid)], has_more: false } }],
    });
    expect(result.provenanceConfirmed).toBe(false);
  });

  it("throws when projectResponse is null and no feedCaptures are supplied", () => {
    expect(() =>
      collectSunoWorkspaceFromCaptures("wid-empty", { projectResponse: null, feedCaptures: [] }),
    ).toThrow(/nothing to ingest/);
  });
});
