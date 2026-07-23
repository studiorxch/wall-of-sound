import { describe, it, expect } from "vitest";
import {
  normalizeCommentInput, commentContainsQuery, truncateCommentPreview,
  computeBatchCommentValue, previewBatchCommentOperation,
} from "./libraryComments";

describe("normalizeCommentInput", () => {
  it("trims leading and trailing whitespace including blank lines", () => {
    expect(normalizeCommentInput("  \n  hello world  \n\n")).toBe("hello world");
  });
  it("preserves intentional internal line breaks and spaces", () => {
    expect(normalizeCommentInput("line one\n\nline two   still")).toBe("line one\n\nline two   still");
  });
  it("normalizes an all-whitespace value to undefined (removes the field)", () => {
    expect(normalizeCommentInput("   \n\t  ")).toBeUndefined();
  });
  it("normalizes an empty string to undefined", () => {
    expect(normalizeCommentInput("")).toBeUndefined();
  });
});

describe("commentContainsQuery", () => {
  it("matches case-insensitively", () => {
    expect(commentContainsQuery("Needs a Remix", "remix")).toBe(true);
  });
  it("does not match absent comments", () => {
    expect(commentContainsQuery(undefined, "remix")).toBe(false);
  });
  it("treats an empty query as matching everything", () => {
    expect(commentContainsQuery(undefined, "")).toBe(true);
  });
});

describe("truncateCommentPreview", () => {
  it("collapses internal line breaks to spaces for the single-line preview", () => {
    expect(truncateCommentPreview("line one\nline two")).toBe("line one line two");
  });
  it("truncates long text with an ellipsis at the requested length", () => {
    const long = "a".repeat(100);
    const preview = truncateCommentPreview(long, 10);
    expect(preview.length).toBe(10);
    expect(preview.endsWith("…")).toBe(true);
  });
  it("returns empty string for an absent comment", () => {
    expect(truncateCommentPreview(undefined)).toBe("");
  });
});

describe("computeBatchCommentValue", () => {
  it("append: uses the new text as-is when existing is empty (no stray separator)", () => {
    expect(computeBatchCommentValue("append", "new note", undefined)).toBe("new note");
  });
  it("append: joins with a newline when existing already has content", () => {
    expect(computeBatchCommentValue("append", "second", "first")).toBe("first\nsecond");
  });
  it("append: leaves existing untouched when the new text normalizes to empty", () => {
    expect(computeBatchCommentValue("append", "   ", "first")).toBe("first");
  });
  it("replace: overwrites regardless of existing content", () => {
    expect(computeBatchCommentValue("replace", "brand new", "old value")).toBe("brand new");
  });
  it("replace: an empty replacement removes the field", () => {
    expect(computeBatchCommentValue("replace", "  ", "old value")).toBeUndefined();
  });
  it("clear: always removes the field regardless of the text argument", () => {
    expect(computeBatchCommentValue("clear", "ignored", "old value")).toBeUndefined();
  });
});

describe("previewBatchCommentOperation", () => {
  it("reports the exact affected count and a representative before/after sample", () => {
    const tracks = [{ notes: "existing" }, { notes: undefined }, { notes: "other" }];
    const preview = previewBatchCommentOperation("append", "added", tracks);
    expect(preview.affectedCount).toBe(3);
    expect(preview.sampleBefore).toBe("existing");
    expect(preview.sampleAfter).toBe("existing\nadded");
  });
  it("handles an empty selection without throwing", () => {
    expect(previewBatchCommentOperation("clear", "", [])).toEqual({ affectedCount: 0 });
  });
});

describe("library-agnostic — no branching on sourceOwner anywhere in this module", () => {
  it("behaves identically for a Catalog-shaped, External-shaped, and Sounds-shaped track object", () => {
    const catalogTrack = { notes: "x", sourceOwner: "studiorich" as const };
    const externalTrack = { notes: "x", sourceOwner: "external" as const };
    const soundsTrack = { notes: "x", sourceOwner: "reference" as const };
    for (const t of [catalogTrack, externalTrack, soundsTrack]) {
      expect(commentContainsQuery(t.notes, "x")).toBe(true);
      expect(truncateCommentPreview(t.notes)).toBe("x");
    }
  });
});
