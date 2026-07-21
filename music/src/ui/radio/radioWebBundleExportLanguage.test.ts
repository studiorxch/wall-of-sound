// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — "EXPORTED must never
// imply deployed" is a hard requirement (spec test 22). Checked directly
// against the UI source's user-facing JSX text rather than by mounting a
// component (this project has no @testing-library/react harness — see
// radioLoopAudition.isolation.test.ts for the established precedent).
// Comment lines are stripped before scanning so the guard checks actual
// rendered text, not the doc comments that explain the constraint (which
// legitimately name the forbidden words).

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

function sourceTextOf(fileName: string): string {
  return fs.readFileSync(path.join(__dirname, fileName), "utf-8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const DIALOG_SOURCE = sourceTextOf("RadioWebExportPreflightDialog.tsx");
const PANEL_SOURCE = sourceTextOf("RadioPlaylistPublishPanel.tsx");

// Case-insensitive — a claim like "Uploaded" or "DEPLOYED" is exactly as
// dishonest as the lowercase form.
const FORBIDDEN_DELIVERY_CLAIMS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /uploaded|uploading a bundle|will upload/i, reason: "claims something was/will be uploaded" },
  { pattern: /deployed|deploying|will deploy/i, reason: "claims something was/will be deployed" },
  { pattern: /\bhosted\b|\bhosting\b/i, reason: "claims something is hosted" },
  { pattern: /publish to web/i, reason: "claims a real web-publish bridge (0718A's honest-language rule, still binding)" },
  { pattern: /\bunpublish\b/i, reason: "implies a real publish/unpublish cycle exists (0718A's honest-language rule, still binding)" },
  // Deliberately NOT a bare "live site" pattern — the existing 0718A
  // notice honestly says "not any live public site", a negation this
  // guard must not misflag as a positive claim.
  { pattern: /goes live|is now live|\bnow live\b/i, reason: "claims live delivery" },
];

describe("RadioWebExportPreflightDialog — honest local-only language (source-text guard)", () => {
  it('contains the mandatory literal statement "Does not upload or deploy."', () => {
    expect(DIALOG_SOURCE).toContain("Does not upload or deploy.");
  });

  for (const { pattern, reason } of FORBIDDEN_DELIVERY_CLAIMS) {
    it(`never renders a delivery claim: ${reason}`, () => {
      expect(pattern.test(DIALOG_SOURCE)).toBe(false);
    });
  }
});

describe("RadioPlaylistPublishPanel — honest local-only language (source-text guard)", () => {
  for (const { pattern, reason } of FORBIDDEN_DELIVERY_CLAIMS) {
    it(`never renders a delivery claim: ${reason}`, () => {
      expect(pattern.test(PANEL_SOURCE)).toBe(false);
    });
  }
});
