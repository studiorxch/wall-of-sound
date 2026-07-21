// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — integrity + currency
// verification for ONE exact RadioTrack package binding (spec §Staleness
// rules). Node-only. Reports facts; NEVER regenerates, rebinds, or
// mutates anything — a stale package stays stale until the curator takes
// an explicit "Prepare new version" action.

import fs from "node:fs";
import path from "node:path";
import { isPathConfinedTo, readJsonSafe } from "./radioFsUtils";
import { sha256File } from "./radioVersionCloneHelper";
import { trackPackageVersionDir } from "./radioTrackPackageWriter";
import type { RadioTrackPackageManifest, RadioTrackVerifyResult } from "../../src/data/radioTrackPackageTypes";
import type { RadioValidationIssue } from "../../src/data/radioLoopTypes";

function issue(code: string, message: string): RadioValidationIssue {
  return { code, message, severity: "error" };
}

export interface VerifyTrackBindingParams {
  trackLibraryRoot: string;
  musicLibraryRoot: string;
  radioTrackId: string;
  packageVersion: number;
  sourceAssetHash: string; // the hash the binding/approval was made against
  packageManifestHash: string;
}

export function verifyTrackBinding(params: VerifyTrackBindingParams): RadioTrackVerifyResult {
  const { trackLibraryRoot, musicLibraryRoot, radioTrackId, packageVersion, sourceAssetHash, packageManifestHash } = params;
  const issues: RadioValidationIssue[] = [];

  const result: RadioTrackVerifyResult = {
    ok: false,
    packageExists: false,
    manifestValid: false,
    manifestHashMatches: false,
    audioAssetIntact: false,
    decodeVerificationRecorded: false,
    sourceHashCurrent: false,
    currentSourceAssetHash: null,
    issues,
  };

  const pkgDir = trackPackageVersionDir(trackLibraryRoot, radioTrackId, packageVersion);
  if (!fs.existsSync(pkgDir)) {
    issues.push(issue("RADIO_TRACK_VERIFY_PACKAGE_MISSING", `Package ${radioTrackId} v${packageVersion} not found on disk`));
    return result;
  }
  result.packageExists = true;

  const metadataPath = path.join(pkgDir, "metadata.json");
  const metadata = readJsonSafe<RadioTrackPackageManifest>(metadataPath);
  if (!metadata || metadata.radioTrackId !== radioTrackId || metadata.packageVersion !== packageVersion || !metadata.audio?.primary?.relativePath) {
    issues.push(issue("RADIO_TRACK_VERIFY_MANIFEST_INVALID", "Package metadata.json is missing, unparseable, or inconsistent"));
    return result;
  }
  result.manifestValid = true;

  if (sha256File(metadataPath) !== packageManifestHash) {
    issues.push(issue("RADIO_TRACK_VERIFY_MANIFEST_HASH_MISMATCH", "Package metadata.json no longer matches the bound manifest hash"));
  } else {
    result.manifestHashMatches = true;
  }

  const audioPath = path.join(pkgDir, metadata.audio.primary.relativePath);
  if (!fs.existsSync(audioPath)) {
    issues.push(issue("RADIO_TRACK_VERIFY_AUDIO_MISSING", "Encoded audio asset is missing from the package"));
  } else {
    const byteSize = fs.statSync(audioPath).size;
    if (byteSize !== metadata.audio.primary.byteSize || sha256File(audioPath) !== metadata.audio.primary.sha256) {
      issues.push(issue("RADIO_TRACK_VERIFY_AUDIO_CORRUPT", "Encoded audio asset does not match its manifest hash/size"));
    } else {
      result.audioAssetIntact = true;
    }
  }

  if (metadata.verification?.decodeVerifyOk === true && metadata.verification?.probeOk === true) {
    result.decodeVerificationRecorded = true;
  } else {
    issues.push(issue("RADIO_TRACK_VERIFY_NO_DECODE_RECORD", "Package has no successful decode-verification record"));
  }

  // Source currency: the MUSIC source file's CURRENT bytes must still
  // match the hash the approval/binding was made against.
  const sourcePath = path.resolve(musicLibraryRoot, metadata.source.audioRelPath);
  if (!isPathConfinedTo(musicLibraryRoot, sourcePath) || !fs.existsSync(sourcePath)) {
    issues.push(issue("RADIO_TRACK_VERIFY_SOURCE_MISSING", "MUSIC source file for this package no longer resolves"));
  } else {
    const currentHash = sha256File(sourcePath);
    result.currentSourceAssetHash = currentHash;
    if (currentHash === sourceAssetHash && currentHash === metadata.sourceAssetHash) {
      result.sourceHashCurrent = true;
    } else {
      issues.push(issue("RADIO_TRACK_VERIFY_SOURCE_CHANGED", "MUSIC source bytes have changed since this package/approval was made"));
    }
  }

  result.ok =
    result.packageExists &&
    result.manifestValid &&
    result.manifestHashMatches &&
    result.audioAssetIntact &&
    result.decodeVerificationRecorded &&
    result.sourceHashCurrent;
  return result;
}
