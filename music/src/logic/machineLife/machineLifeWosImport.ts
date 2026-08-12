// Machine Life WOS Share import orchestration (0811_MACHINE-LIFE_MUSIC-
// Research-Workspace-Handoff_v1.0.0, Import Requirements). The only module
// in this feature that talks to the network — everything it calls
// (stageMachineLifeManifestImport, matchProxiesToCollection,
// uploadMachineLifeProxyFile) is pure/tested elsewhere.
//
// The browser never persists an absolute filesystem path: the mirror root
// is fetched fresh from the server for each import operation (same
// in-memory-only pattern the existing /library-root route already
// establishes for LIBRARY_ROOT) and is discarded once the operation
// finishes. Only portable audioRelPath values (from the reused
// /library-import endpoint) end up in saved state.

import type { MachineLifeCollection, MachineLifeProxyAudio, MachineLifeProxyImportIssue } from "../../data/machineLifeTypes";
import { stageMachineLifeManifestImport, type MachineLifeManifestStageResult } from "./machineLifeManifestAdapter";
import { classifyProxyPath, matchProxiesToCollection, stemOf, uploadMachineLifeProxyFile } from "./machineLifeProxyImport";
import type { DiscoveredProxyFile } from "./machineLifeProxyImport";

const MANIFEST_REL_PATH = "REFERENCE/MANIFESTS/stage-00-pre-life-manifest.json";
const PROXY_ROOT_REL_PATH = "REFERENCE/AUDIO_PROXIES";

async function fetchMirrorRoot(): Promise<string> {
  const res = await fetch("/machine-life-mirror-root");
  if (!res.ok) throw new Error(`Could not resolve Machine Life mirror root (HTTP ${res.status}).`);
  const body = (await res.json()) as { root: string; exists: boolean };
  if (!body.exists) throw new Error("Machine Life WOS Share mirror was not found on this machine.");
  return body.root;
}

export async function stageMachineLifeManifestFromWosShare(
  existingCollections: MachineLifeCollection[],
  now: string,
): Promise<MachineLifeManifestStageResult> {
  const root = await fetchMirrorRoot();
  const manifestAbsPath = `${root}/${MANIFEST_REL_PATH}`;
  const res = await fetch(`/library-data?path=${encodeURIComponent(manifestAbsPath)}`);
  if (!res.ok) {
    return { status: "rejected_schema", error: `Could not read manifest from WOS Share (HTTP ${res.status}).` };
  }
  const text = await res.text();
  return stageMachineLifeManifestImport(text, `WOS-share/MACHINE_LIFE/${MANIFEST_REL_PATH}`, existingCollections, now);
}

interface DiscoveredProxyWithPath extends DiscoveredProxyFile {
  absPath: string;
}

async function discoverProxies(): Promise<DiscoveredProxyWithPath[]> {
  const root = await fetchMirrorRoot();
  const proxyRootAbsPath = `${root}/${PROXY_ROOT_REL_PATH}`;
  const res = await fetch(`/library-ls?path=${encodeURIComponent(proxyRootAbsPath)}`);
  if (!res.ok) throw new Error(`Could not list Machine Life audio proxies (HTTP ${res.status}).`);
  const entries = (await res.json()) as Array<{ name: string; path: string }>;

  const discovered: DiscoveredProxyWithPath[] = [];
  const prefix = `${proxyRootAbsPath}/`;
  for (const entry of entries) {
    if (!entry.name.toLowerCase().endsWith(".mp3")) continue;
    const relative = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
    const kind = classifyProxyPath(relative);
    if (!kind) continue;
    discovered.push({ kind, stem: stemOf(entry.name), fileName: entry.name, absPath: entry.path });
  }
  return discovered;
}

export interface ProxyImportProgress {
  done: number;
  total: number;
  current: string;
}

export interface MachineLifeProxyImportResult {
  proxies: MachineLifeProxyAudio[];
  issues: MachineLifeProxyImportIssue[];
}

export async function importMachineLifeProxiesFromWosShare(
  collection: MachineLifeCollection,
  now: string,
  onProgress?: (progress: ProxyImportProgress) => void,
): Promise<MachineLifeProxyImportResult> {
  const discovered = await discoverProxies();
  const { matched, issues } = matchProxiesToCollection(collection, discovered);
  const byKey = new Map(discovered.map((d) => [`${d.kind}:${d.stem}`, d]));

  const proxies: MachineLifeProxyAudio[] = [];
  const uploadIssues: MachineLifeProxyImportIssue[] = [];

  for (let i = 0; i < matched.length; i++) {
    const descriptor = matched[i];
    onProgress?.({ done: i, total: matched.length, current: descriptor.fileName });
    const withPath = byKey.get(`${descriptor.kind}:${descriptor.stem}`);
    if (!withPath) continue;

    const audioRes = await fetch(`/machine-life-audio-data?path=${encodeURIComponent(withPath.absPath)}`);
    if (!audioRes.ok) {
      uploadIssues.push({ kind: descriptor.kind, stem: descriptor.stem, reason: "upload_failed", detail: `Could not fetch proxy bytes (HTTP ${audioRes.status}).` });
      continue;
    }
    const blob = await audioRes.blob();
    const file = new File([blob], descriptor.fileName, { type: blob.type || "audio/mpeg" });

    const outcome = await uploadMachineLifeProxyFile(descriptor, file, now);
    if (outcome.proxy) proxies.push(outcome.proxy);
    if (outcome.issue) uploadIssues.push(outcome.issue);
  }
  onProgress?.({ done: matched.length, total: matched.length, current: "" });

  return { proxies, issues: [...issues, ...uploadIssues] };
}
