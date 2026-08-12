import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importSunoLibraryManifests } from "./manifestAdapter";
import { validateManifestSourceTexts, type ManifestSourceTexts } from "./manifestValidation";
import { buildTrainingExclusionRecords } from "./trainingEligibility";
import { createTrainingExclusionExport, trainingExclusionExportCsv, trainingExclusionExportJson } from "./trainingExclusionExport";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_DIR = path.resolve(__dirname, "../../../../WOS-share/SUNO_LIBRARY/MANIFESTS");
function readReal(name: string): string {
  return readFileSync(path.join(MANIFEST_DIR, name), "utf-8");
}
const REAL_SOURCES: ManifestSourceTexts = {
  acquisitionSnapshot: readReal("suno-acquisition-snapshot.json"),
  audioInventory: readReal("suno-audio-inventory.json"),
  duplicateGroups: readReal("suno-duplicate-groups.json"),
  supplementalAssets: readReal("suno-supplemental-assets.json"),
  syncCheckpoint: readReal("suno-sync-checkpoint.json"),
};
const importResult = importSunoLibraryManifests(REAL_SOURCES);
if (importResult.status === "BLOCKED") throw new Error("fixture import blocked");
const validation = validateManifestSourceTexts(REAL_SOURCES);
if (validation.status === "BLOCKED") throw new Error("fixture validation blocked");
const NOW = "2026-08-12T12:00:00.000Z";
const exclusionResult = buildTrainingExclusionRecords(
  importResult.encodedLocations,
  importResult.canonicalRecordings,
  importResult.batches,
  importResult.duplicateRelationships,
  validation.bundle.audioInventory.audioAssets,
  NOW,
);

describe("trainingExclusionExport", () => {
  it("JSON export lists all 549 excluded locations", () => {
    const exportData = createTrainingExclusionExport(exclusionResult, NOW);
    expect(exportData.locationRecords.length).toBe(549);
    expect(exportData.canonicalSummaries.length).toBe(402);
    const json = trainingExclusionExportJson(exportData);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("CSV export has a header plus exactly 549 data rows, with the two real captures both present under New Lofi", () => {
    const exportData = createTrainingExclusionExport(exclusionResult, NOW);
    const csv = trainingExclusionExportCsv(exportData);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("encodedLocationId");
    expect(lines.length).toBe(1 + 549);
    // Exact-field match (",new-lofi,") — a substring match would also catch
    // "new-lofi-wo-you", a different workspace in the same authority table.
    const newLofiLines = lines.filter((l) => l.includes(",new-lofi,"));
    expect(newLofiLines.length).toBe(154);
  });

  it("every CSV row marks propagation source as direct or propagated-via-canonical-group", () => {
    const exportData = createTrainingExclusionExport(exclusionResult, NOW);
    const csv = trainingExclusionExportCsv(exportData);
    const dataLines = csv.split("\n").slice(1);
    const directCount = dataLines.filter((l) => l.includes(",direct,")).length;
    const propagatedCount = dataLines.filter((l) => l.includes(",propagated-via-canonical-group,")).length;
    expect(directCount).toBe(531);
    expect(propagatedCount).toBe(18);
  });
});
