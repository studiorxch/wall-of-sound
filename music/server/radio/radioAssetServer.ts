// RadioLoop Library Workspace (0717A) — GET /radio-package-asset
// resolution. Node-only. Path-confined, status-checked resolution of a
// declared package asset; the actual byte-range HTTP streaming lives in
// vite.config.ts, mirroring the existing /music-audio route's
// Content-Range handling.

import fs from "node:fs";
import path from "node:path";
import { isPathConfinedTo, readJsonSafe } from "./radioFsUtils";
import { packageVersionDir } from "./radioPackageWriter";
import { RADIO_OPUS_ENCODING_POLICY, type RadioLoopId, type RadioLoopPackageManifest, type RadioPackageVersion } from "../../src/data/radioLoopTypes";

export interface ResolvedRadioAsset {
  ok: true;
  filePath: string;
  mimeType: string;
}

export interface RadioAssetResolutionFailure {
  ok: false;
  httpStatus: 404 | 409;
  code: string;
  message: string;
}

const STEM_TARGET_PATTERN = /^stem:(.+)$/;

// §7.2 — 404 for missing/invalid, 409 specifically for retired (a valid
// package that governance has excluded from audition, distinct from "not
// found"). `asset` must be exactly "core" or a name declared in
// metadata.stems — never a client-supplied path.
export function resolveRadioAsset(
  radioLibraryRoot: string,
  radioLoopId: RadioLoopId,
  packageVersion: RadioPackageVersion,
  asset: string,
): ResolvedRadioAsset | RadioAssetResolutionFailure {
  const dir = packageVersionDir(radioLibraryRoot, radioLoopId, packageVersion);
  const metadata = readJsonSafe<RadioLoopPackageManifest>(path.join(dir, "metadata.json"));
  if (!metadata) {
    return { ok: false, httpStatus: 404, code: "RADIO_ASSET_PACKAGE_NOT_FOUND", message: `Package ${radioLoopId} v${packageVersion} not found` };
  }
  if (metadata.status === "RETIRED") {
    return { ok: false, httpStatus: 409, code: "RADIO_ASSET_PACKAGE_RETIRED", message: `Package ${radioLoopId} v${packageVersion} is retired` };
  }

  let relativePath: string;
  let mimeType: string;
  if (asset === "core") {
    relativePath = metadata.audio.primary.relativePath;
    mimeType = metadata.audio.primary.mimeType;
  } else {
    const stemName = STEM_TARGET_PATTERN.exec(asset)?.[1];
    const stem = stemName ? metadata.stems?.find((s) => s.name === stemName) : undefined;
    if (!stem) {
      return { ok: false, httpStatus: 404, code: "RADIO_ASSET_NOT_DECLARED", message: `Asset "${asset}" is not declared in this package` };
    }
    relativePath = stem.relativePath;
    mimeType = RADIO_OPUS_ENCODING_POLICY.mimeType;
  }

  const filePath = path.join(dir, relativePath);
  if (!isPathConfinedTo(dir, filePath)) {
    return { ok: false, httpStatus: 404, code: "RADIO_ASSET_PATH_INVALID", message: "Resolved asset path escapes the package directory" };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, httpStatus: 404, code: "RADIO_ASSET_FILE_MISSING", message: `Declared asset file missing on disk: ${relativePath}` };
  }
  return { ok: true, filePath, mimeType };
}
