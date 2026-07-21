// RadioLoop Library Foundation — machine-readable operation reports
// (README §3 directory contract: reports/encoding/, reports/validation/).
// Node-only.

import path from "node:path";
import { writeJsonAtomic } from "./radioFsUtils";
import type { RadioPromotionReport } from "../../src/data/radioLoopTypes";

export function writeEncodingReport(radioLibraryRoot: string, report: RadioPromotionReport): string {
  const file = path.join(radioLibraryRoot, "reports", "encoding", `${report.radioLoopId}-v${report.packageVersion}-${report.operationId}.json`);
  writeJsonAtomic(file, report);
  return file;
}

export function writeValidationReport(radioLibraryRoot: string, report: RadioPromotionReport): string {
  const file = path.join(radioLibraryRoot, "reports", "validation", `${report.operationId}.json`);
  writeJsonAtomic(file, report);
  return file;
}
