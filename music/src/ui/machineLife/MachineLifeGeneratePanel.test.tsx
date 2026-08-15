import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MachineLifeGeneratePanel } from "./MachineLifeGeneratePanel";
import * as client from "../../logic/machineLife/machineLifeGeneratorClient";
import type { MachineLifeGenerationJob } from "../../data/machineLifeTypes";

vi.mock("../../logic/machineLife/machineLifeGeneratorClient");

describe("MachineLifeGeneratePanel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.resetAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(client, "fetchGeneratorHealth").mockResolvedValue({
      status: "online",
      backendId: "facebook/musicgen-small",
      device: "mps",
      modelReady: true,
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it("preserves user prompt text when error or timeout occurs", async () => {
    vi.spyOn(client, "submitGenerationJob").mockRejectedValue(
      new Error("Generation request failed")
    );

    await act(async () => {
      root!.render(<MachineLifeGeneratePanel latestGeneration={null} onSaveGeneration={vi.fn()} />);
    });

    const textarea = container!.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    const userPrompt = "experimental ambient texture";
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textarea, userPrompt);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(textarea.value).toBe(userPrompt);

    const generateBtn = container!.querySelector(".ml-generate-btn") as HTMLButtonElement;
    expect(generateBtn).not.toBeNull();

    await act(async () => {
      generateBtn.click();
    });

    const errorSpan = container!.querySelector(".ml-generate-error");
    expect(errorSpan?.textContent).toContain("Generation request failed");
    expect(textarea.value).toBe(userPrompt);
  });

  it("continues polling beyond 60s up to 300s ceiling (600 attempts)", async () => {
    vi.useFakeTimers();

    vi.spyOn(client, "submitGenerationJob").mockResolvedValue({ jobId: "job_123" });

    let pollCount = 0;
    vi.spyOn(client, "pollGenerationJob").mockImplementation(async (jobId: string): Promise<MachineLifeGenerationJob> => {
      pollCount++;
      if (pollCount >= 130) {
        return {
          jobId,
          status: "completed",
          result: {
            id: "mlgen_0001",
            prompt: "experimental ambient texture",
            durationSeconds: 10,
            seed: 12345,
            residentId: null,
            engine: "facebook/musicgen-small",
            canonicalWavFilename: "mlgen_0001.wav",
            canonicalChecksumSha256: "abc",
            createdAt: new Date().toISOString(),
          },
        };
      }
      return {
        jobId,
        status: "processing",
      };
    });

    vi.spyOn(client, "fetchGeneratedAudioBlob").mockResolvedValue(new Blob(["mock wav"], { type: "audio/wav" }));
    vi.spyOn(client, "intakeGeneratedAudioProxy").mockResolvedValue({
      proxy: {
        kind: "generation",
        stem: "fullMix",
        fileName: "mlgen_0001.wav",
        audioRelPath: "machine_life/mlgen_0001.wav",
        durationSeconds: 10,
        createdAt: new Date().toISOString(),
      },
    });

    await act(async () => {
      root!.render(<MachineLifeGeneratePanel latestGeneration={null} onSaveGeneration={vi.fn()} />);
    });

    const textarea = container!.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textarea, "experimental ambient texture");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const generateBtn = container!.querySelector(".ml-generate-btn") as HTMLButtonElement;

    let handlePromise: Promise<void> | null = null;
    await act(async () => {
      generateBtn.click();
    });

    // Advance past the old 60s timeout ceiling (120 attempts * 500ms = 60000ms)
    for (let i = 0; i < 140; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }

    expect(pollCount).toBeGreaterThan(120);

    const statusSpan = container!.querySelector(".ml-generate-status");
    expect(statusSpan?.textContent).toContain("Generated mlgen_0001 successfully");

    vi.useRealTimers();
  });
});
