import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import { publishRadioToSites, PublishToSitesError } from "./publish-radio-to-sites.mjs";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// Builds a minimal, self-consistent already-exported bundle directory —
// the same shape real MUSIC "Publish" output has (radio-manifest.json +
// checksums.json + the files they reference) — so publishRadioToSites's
// own validateSource() accepts it exactly as it would a real export.
function makeValidExport(exportsRoot, slug, version) {
  const dir = join(exportsRoot, slug, `v${version}`);
  mkdirSync(dir, { recursive: true });
  const manifest = {
    schemaVersion: "1.0.0",
    stationId: slug,
    title: "Test Station",
    bundleVersion: version,
    entries: [{ audioUrl: "audio/track1.opus" }],
  };
  const audioBytes = Buffer.from(`fake-opus-audio-v${version}`);
  mkdirSync(join(dir, "audio"), { recursive: true });
  writeFileSync(join(dir, "audio/track1.opus"), audioBytes);
  writeFileSync(join(dir, "radio-manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(dir, "playlist.json"), JSON.stringify({ slug, version }));

  const files = {
    "radio-manifest.json": readFileSync(join(dir, "radio-manifest.json")),
    "playlist.json": readFileSync(join(dir, "playlist.json")),
    "audio/track1.opus": audioBytes,
  };
  const checksums = { files: {} };
  for (const [rel, buf] of Object.entries(files)) {
    checksums.files[rel] = { byteSize: buf.length, sha256: sha256(buf) };
  }
  writeFileSync(join(dir, "checksums.json"), JSON.stringify(checksums));
  return dir;
}

function makeSitesRoot(root) {
  mkdirSync(join(root, ".openai"), { recursive: true });
  writeFileSync(join(root, ".openai/hosting.json"), JSON.stringify({ test: true }));
}

describe("publishRadioToSites", () => {
  let scratch;
  let exportsRoot;
  let sitesRoot;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), "radio-publish-test-"));
    exportsRoot = join(scratch, "exports");
    sitesRoot = join(scratch, "sites");
    mkdirSync(exportsRoot, { recursive: true });
    makeSitesRoot(sitesRoot);
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("copies a valid export into the Sites checkout and activates it", async () => {
    makeValidExport(exportsRoot, "soft-motion-radio", 1);
    const result = await publishRadioToSites({ slug: "soft-motion-radio", version: 1, exportsRoot, sitesRoot });

    expect(result.activated).toBe(true);
    expect(result.fileCount).toBe(3);
    expect(result.manifestUrl).toBe("radio/soft-motion-radio/v1/radio-manifest.json");

    const finalManifestPath = join(sitesRoot, "public/radio/soft-motion-radio/v1/radio-manifest.json");
    expect(existsSync(finalManifestPath)).toBe(true);

    const active = JSON.parse(readFileSync(join(sitesRoot, "public/radio/active.json"), "utf8"));
    expect(active.stationSlug).toBe("soft-motion-radio");
    expect(active.bundleVersion).toBe(1);
  });

  it("rejects an unknown slug (no export on disk) without touching the Sites checkout", async () => {
    await expect(
      publishRadioToSites({ slug: "does-not-exist", version: 1, exportsRoot, sitesRoot }),
    ).rejects.toBeInstanceOf(PublishToSitesError);
    expect(existsSync(join(sitesRoot, "public/radio"))).toBe(false);
  });

  it("rejects when the Sites checkout doesn't exist locally (fails closed, no fallback)", async () => {
    makeValidExport(exportsRoot, "soft-motion-radio", 1);
    await expect(
      publishRadioToSites({ slug: "soft-motion-radio", version: 1, exportsRoot, sitesRoot: join(scratch, "missing-sites-root") }),
    ).rejects.toBeInstanceOf(PublishToSitesError);
  });

  it("rejects a tampered/corrupt export (checksum mismatch) and leaves the live directory untouched", async () => {
    const dir = makeValidExport(exportsRoot, "tampered-station", 1);
    writeFileSync(join(dir, "audio/track1.opus"), Buffer.from("corrupted-after-checksum-was-written"));

    await expect(
      publishRadioToSites({ slug: "tampered-station", version: 1, exportsRoot, sitesRoot }),
    ).rejects.toBeInstanceOf(PublishToSitesError);
    expect(existsSync(join(sitesRoot, "public/radio/tampered-station"))).toBe(false);
  });

  it("is idempotent — republishing the same already-published version succeeds again", async () => {
    makeValidExport(exportsRoot, "soft-motion-radio", 1);
    await publishRadioToSites({ slug: "soft-motion-radio", version: 1, exportsRoot, sitesRoot });
    const second = await publishRadioToSites({ slug: "soft-motion-radio", version: 1, exportsRoot, sitesRoot });
    expect(second.fileCount).toBe(3);
    expect(existsSync(join(sitesRoot, "public/radio/soft-motion-radio/v1/radio-manifest.json"))).toBe(true);
  });

  it("does not overwrite a different immutable version's directory when publishing a new version", async () => {
    makeValidExport(exportsRoot, "soft-motion-radio", 1);
    makeValidExport(exportsRoot, "soft-motion-radio", 2);
    await publishRadioToSites({ slug: "soft-motion-radio", version: 1, exportsRoot, sitesRoot });
    await publishRadioToSites({ slug: "soft-motion-radio", version: 2, exportsRoot, sitesRoot });

    const v1Audio = readFileSync(join(sitesRoot, "public/radio/soft-motion-radio/v1/audio/track1.opus"), "utf8");
    const v2Audio = readFileSync(join(sitesRoot, "public/radio/soft-motion-radio/v2/audio/track1.opus"), "utf8");
    expect(v1Audio).toContain("v1");
    expect(v2Audio).toContain("v2");
  });

  it("respects activate: false — copies the version but does not flip active.json", async () => {
    makeValidExport(exportsRoot, "soft-motion-radio", 1);
    const result = await publishRadioToSites({ slug: "soft-motion-radio", version: 1, exportsRoot, sitesRoot, activate: false });
    expect(result.activated).toBe(false);
    expect(result.manifestUrl).toBeNull();
    expect(existsSync(join(sitesRoot, "public/radio/active.json"))).toBe(false);
    expect(existsSync(join(sitesRoot, "public/radio/soft-motion-radio/v1/radio-manifest.json"))).toBe(true);
  });
});
