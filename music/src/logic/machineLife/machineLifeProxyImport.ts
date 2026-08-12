// Machine Life proxy association (0811_MACHINE-LIFE_MUSIC-Research-Workspace-
// Handoff_v1.0.0, Import Requirements). Associates MP3 listening proxies to
// Pre-Life recordings / raw sources by stable filename stem — never by
// re-deriving canonical identity from the proxy itself.
//
// Reuses the EXISTING governed upload endpoint (/library-import, the same
// one audioImport.ts's importAudioFiles() posts to) so proxy bytes land
// under LIBRARY_ROOT with a portable relPath, exactly like any other
// imported track's audio. No parallel import/upload system is created here.
// extractDuration() is the same Web Audio decode helper importAudioFiles()
// itself uses.

import { extractDuration } from "../audioImport";
import type {
  MachineLifeCollection,
  MachineLifeProxyAudio,
  MachineLifeProxyImportIssue,
  MachineLifeProxyKind,
} from "../../data/machineLifeTypes";

export function stemOf(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

// Destination folders under LIBRARY_ROOT, parallel to audioImport.ts's own
// DESTINATION_FOLDERS convention (catalog/audio, external/audio, ...).
const PROXY_DESTINATION_FOLDERS: Record<MachineLifeProxyKind, string> = {
  "pre-life": "machine-life/pre-life",
  raw: "machine-life/raw",
};

/** Classifies a discovered proxy file by which subfolder it was found in. */
export function classifyProxyPath(relativePathOrName: string): MachineLifeProxyKind | null {
  const normalized = relativePathOrName.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes("/pre-life/") || normalized.startsWith("pre-life/")) return "pre-life";
  if (normalized.includes("/raw/") || normalized.startsWith("raw/")) return "raw";
  return null;
}

export interface DiscoveredProxyFile {
  kind: MachineLifeProxyKind;
  stem: string;
  fileName: string;
}

/**
 * Matches discovered proxy files against a collection's expected stems.
 * Reports missing proxies (expected stem, none discovered) and duplicate
 * stems (more than one discovered file resolves to the same stem+kind) —
 * never silently drops either case.
 */
export function matchProxiesToCollection(
  collection: MachineLifeCollection,
  discovered: DiscoveredProxyFile[],
): { matched: DiscoveredProxyFile[]; issues: MachineLifeProxyImportIssue[] } {
  const issues: MachineLifeProxyImportIssue[] = [];
  const byKey = new Map<string, DiscoveredProxyFile[]>();
  for (const d of discovered) {
    const key = `${d.kind}:${d.stem}`;
    const list = byKey.get(key) ?? [];
    list.push(d);
    byKey.set(key, list);
  }

  const expected: Array<{ kind: MachineLifeProxyKind; stem: string }> = [
    ...collection.recordings.map((r) => ({ kind: "pre-life" as const, stem: stemOf(r.canonicalFilename) })),
    ...collection.rawSources.map((s) => ({ kind: "raw" as const, stem: stemOf(s.filename) })),
  ];

  const matched: DiscoveredProxyFile[] = [];
  for (const exp of expected) {
    const key = `${exp.kind}:${exp.stem}`;
    const found = byKey.get(key);
    if (!found || found.length === 0) {
      issues.push({ kind: exp.kind, stem: exp.stem, reason: "missing" });
      continue;
    }
    if (found.length > 1) {
      issues.push({ kind: exp.kind, stem: exp.stem, reason: "duplicate", detail: `${found.length} files matched this stem` });
      continue;
    }
    matched.push(found[0]);
  }

  return { matched, issues };
}

export interface ProxyUploadOutcome {
  file: DiscoveredProxyFile;
  proxy?: MachineLifeProxyAudio;
  issue?: MachineLifeProxyImportIssue;
}

/**
 * Uploads one already-selected/fetched proxy File through the existing
 * /library-import endpoint and decodes its duration client-side. Never
 * deletes or modifies the source file it was read from.
 */
export async function uploadMachineLifeProxyFile(
  descriptor: DiscoveredProxyFile,
  file: File,
  now: string,
): Promise<ProxyUploadOutcome> {
  const destFolder = PROXY_DESTINATION_FOLDERS[descriptor.kind];
  try {
    const res = await fetch(`/library-import?filename=${encodeURIComponent(descriptor.fileName)}&dest=${destFolder}`, {
      method: "POST",
      body: file,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { file: descriptor, issue: { kind: descriptor.kind, stem: descriptor.stem, reason: "upload_failed", detail: err.error ?? `HTTP ${res.status}` } };
    }
    const { relPath } = (await res.json()) as { relPath: string; existed: boolean; ok: boolean };

    const durationSeconds = await extractDuration(file);
    if (durationSeconds == null) {
      return { file: descriptor, issue: { kind: descriptor.kind, stem: descriptor.stem, reason: "undecodable" } };
    }

    const proxy: MachineLifeProxyAudio = {
      kind: descriptor.kind,
      stem: descriptor.stem,
      proxyFileName: descriptor.fileName,
      audioRelPath: relPath,
      importedAt: now,
      durationSeconds,
    };
    return { file: descriptor, proxy };
  } catch (e) {
    return { file: descriptor, issue: { kind: descriptor.kind, stem: descriptor.stem, reason: "upload_failed", detail: String(e) } };
  }
}

/** Resolves an already-imported proxy's playback URL — same convention as getTrackPlayUrl in App.tsx. */
export function machineLifeProxyPlayUrl(proxy: MachineLifeProxyAudio): string {
  return `/music-audio/${proxy.audioRelPath}`;
}
