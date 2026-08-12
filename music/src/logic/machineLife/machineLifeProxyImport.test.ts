import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { stageMachineLifeManifestImport } from "./machineLifeManifestAdapter";
import { classifyProxyPath, matchProxiesToCollection, stemOf } from "./machineLifeProxyImport";
import type { DiscoveredProxyFile } from "./machineLifeProxyImport";
import type { MachineLifeCollection } from "../../data/machineLifeTypes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WOS_MACHINE_LIFE_ROOT = path.resolve(__dirname, "../../../../WOS-share/MACHINE_LIFE");
const REAL_MANIFEST_TEXT = readFileSync(
  path.join(WOS_MACHINE_LIFE_ROOT, "REFERENCE/MANIFESTS/stage-00-pre-life-manifest.json"),
  "utf-8",
);

function realCollection(): MachineLifeCollection {
  const result = stageMachineLifeManifestImport(REAL_MANIFEST_TEXT, "irrelevant.json", [], "2026-08-11T00:00:00.000Z");
  if (result.status !== "staged") throw new Error("expected staged");
  return result.collection;
}

// Real evidence: discovers the actual proxy files mirrored under WOS Share
// (acceptance tests 5-6 — "match all 25 Pre-Life proxies", "recognize all 8
// raw-source proxies") without needing a running browser/dev server.
function discoverRealProxies(): DiscoveredProxyFile[] {
  const proxyRoot = path.join(WOS_MACHINE_LIFE_ROOT, "REFERENCE/AUDIO_PROXIES");
  const discovered: DiscoveredProxyFile[] = [];
  for (const kindDir of ["pre-life", "raw"] as const) {
    const dir = path.join(proxyRoot, kindDir);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".mp3")) continue;
      const kind = classifyProxyPath(`${kindDir}/${name}`);
      if (!kind) continue;
      discovered.push({ kind, stem: stemOf(name), fileName: name });
    }
  }
  return discovered;
}

describe("machineLifeProxyImport — real WOS Share AUDIO_PROXIES", () => {
  it("classifyProxyPath recognizes pre-life/ and raw/ subfolders", () => {
    expect(classifyProxyPath("pre-life/ml-prelife-0001-signal-seed-8001.mp3")).toBe("pre-life");
    expect(classifyProxyPath("raw/ml-sr-0001-drone-hypnotic-engine.mp3")).toBe("raw");
    expect(classifyProxyPath("something-else/foo.mp3")).toBeNull();
  });

  it("discovers exactly 25 pre-life and 8 raw real proxy files with no duplicate stems", () => {
    const discovered = discoverRealProxies();
    const preLife = discovered.filter((d) => d.kind === "pre-life");
    const raw = discovered.filter((d) => d.kind === "raw");
    expect(preLife).toHaveLength(25);
    expect(raw).toHaveLength(8);
    const stems = discovered.map((d) => `${d.kind}:${d.stem}`);
    expect(new Set(stems).size).toBe(stems.length);
  });

  it("matches every real Pre-Life manifest recording and every raw source to exactly one real proxy stem", () => {
    const collection = realCollection();
    const discovered = discoverRealProxies();
    const { matched, issues } = matchProxiesToCollection(collection, discovered);
    expect(issues).toEqual([]);
    expect(matched).toHaveLength(33); // 25 pre-life + 8 raw
  });

  it("reports a missing proxy honestly rather than fabricating availability", () => {
    const collection = realCollection();
    const discovered = discoverRealProxies().filter((d) => d.stem !== "ml-prelife-0001-signal-seed-8001");
    const { matched, issues } = matchProxiesToCollection(collection, discovered);
    expect(matched).toHaveLength(32);
    expect(issues).toEqual([{ kind: "pre-life", stem: "ml-prelife-0001-signal-seed-8001", reason: "missing" }]);
  });

  it("reports a duplicate stem rather than silently picking one", () => {
    const collection = realCollection();
    const discovered = discoverRealProxies();
    const dup: DiscoveredProxyFile = { ...discovered[0], fileName: "duplicate-copy.mp3" };
    const { issues } = matchProxiesToCollection(collection, [...discovered, dup]);
    expect(issues.some((i) => i.reason === "duplicate" && i.stem === discovered[0].stem)).toBe(true);
  });
});
