import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeJsonAtomic } from "./radioFsUtils";
import { packageVersionDir } from "./radioPackageWriter";
import type { RadioLoopPackageManifest } from "../../src/data/radioLoopTypes";

// Mocked so tests never actually invoke the real `open` command (which
// would pop a real Finder window) — this proves the argument-array
// contract (never an interpolated shell string) without the side effect.
// Live verification exercises the real subprocess on the real macOS
// desktop.
const execFileMock = vi.fn((_cmd: string, _args: string[], cb: (error: Error | null, stdout: string, stderr: string) => void) => cb(null, "", ""));
vi.mock("node:child_process", () => ({ execFile: (...args: unknown[]) => (execFileMock as unknown as (...a: unknown[]) => void)(...args) }));

describe("revealPackageInFinder", () => {
  let root: string;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-package-reveal-"));
    execFileMock.mockClear();
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform);
    vi.resetModules();
  });

  function writePackage(radioLoopId: string, packageVersion: number) {
    const metadata: RadioLoopPackageManifest = {
      schemaVersion: "1.0.0", radioLoopId, packageVersion, status: "RADIO_READY",
      source: { trackId: "track_a", loopId: "loop_a" },
      audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
      musical: {}, arrangement: { roles: [], familyIds: [] },
      approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
    };
    writeJsonAtomic(path.join(packageVersionDir(root, radioLoopId, packageVersion), "metadata.json"), metadata);
  }

  it("calls execFile('open', ['-R', dir]) — an argument array, never a shell string — on darwin", async () => {
    writePackage("rloop_000001", 1);
    Object.defineProperty(process, "platform", { value: "darwin" });
    const { revealPackageInFinder } = await import("./radioPackageReveal");

    const result = await revealPackageInFinder(root, "rloop_000001", 1);

    expect(result.ok).toBe(true);
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const call = execFileMock.mock.calls[0];
    const cmd = call[0] as string;
    const args = call[1] as string[];
    expect(cmd).toBe("open");
    expect(Array.isArray(args)).toBe(true);
    expect(args[0]).toBe("-R");
    expect(args[1]).toContain("rloop_000001");
  });

  it("returns a structured unsupported-platform result without calling execFile on non-macOS", async () => {
    writePackage("rloop_000001", 1);
    Object.defineProperty(process, "platform", { value: "linux" });
    const { revealPackageInFinder } = await import("./radioPackageReveal");

    const result = await revealPackageInFinder(root, "rloop_000001", 1);

    expect(result).toEqual({ ok: false, reason: "unsupported_platform" });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("returns not_found without calling execFile for a missing package", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const { revealPackageInFinder } = await import("./radioPackageReveal");

    const result = await revealPackageInFinder(root, "rloop_999999", 1);

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
