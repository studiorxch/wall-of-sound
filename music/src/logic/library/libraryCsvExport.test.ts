import { describe, it, expect } from "vitest";
import { csvEscapeLibraryField, buildLibraryExportRows, buildLibraryExportCsv } from "./libraryCsvExport";
import type { Track } from "../../data/trackTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    ...overrides,
  } as Track;
}

describe("csvEscapeLibraryField", () => {
  it("leaves plain fields unquoted", () => {
    expect(csvEscapeLibraryField("Simple Title")).toBe("Simple Title");
  });
  it("quotes and escapes a field containing a comma", () => {
    expect(csvEscapeLibraryField("A, B")).toBe('"A, B"');
  });
  it("quotes and doubles embedded quotes", () => {
    expect(csvEscapeLibraryField('He said "hi"')).toBe('"He said ""hi"""');
  });
  it("quotes a field containing a line break", () => {
    expect(csvEscapeLibraryField("line one\nline two")).toBe('"line one\nline two"');
  });
});

describe("buildLibraryExportRows", () => {
  it("includes the private comments (notes) field", () => {
    const rows = buildLibraryExportRows([track({ trackId: "t1", notes: "confidential note" })]);
    expect(rows[0].comments).toBe("confidential note");
  });
  it("uses empty string for absent optional fields rather than 'undefined'", () => {
    const rows = buildLibraryExportRows([track({ trackId: "t1" })]);
    expect(rows[0].comments).toBe("");
    expect(rows[0].bpm).toBe("");
  });
  it("behaves identically for External- and Sounds-sourced tracks (no sourceOwner branching)", () => {
    const external = buildLibraryExportRows([track({ trackId: "t1", sourceOwner: "external", notes: "n" })]);
    const reference = buildLibraryExportRows([track({ trackId: "t2", sourceOwner: "reference", notes: "n" })]);
    expect(external[0].comments).toBe("n");
    expect(reference[0].comments).toBe("n");
  });
});

describe("buildLibraryExportCsv", () => {
  it("includes a header row and one row per track, CRLF-separated", () => {
    const csv = buildLibraryExportCsv([track({ trackId: "t1", title: "Song A" })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Comments");
    expect(lines[1]).toContain("Song A");
  });

  it("safely serializes a multiline comment inside one CSV field", () => {
    const csv = buildLibraryExportCsv([track({ trackId: "t1", notes: "line one\nline two" })]);
    // The whole multiline value must stay inside a single quoted field —
    // splitting on \r\n (not \n alone) must yield exactly 2 lines (header + 1 row).
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain('"line one\nline two"');
  });

  it("escapes a comment containing a comma and a quote", () => {
    const csv = buildLibraryExportCsv([track({ trackId: "t1", notes: 'needs, a "remix"' })]);
    expect(csv).toContain('"needs, a ""remix"""');
  });
});
