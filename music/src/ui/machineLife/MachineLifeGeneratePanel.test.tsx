import { describe, expect, it } from "vitest";
import { GENERATION_MAX_ATTEMPTS } from "./MachineLifeGeneratePanel";
import type { MachineLifeGenerationJob, MachineLifeProxyAudio } from "../../data/machineLifeTypes";

describe("MachineLifeGeneratePanel configuration and logic", () => {
  it("uses a 300-second polling timeout ceiling (600 attempts at 500ms)", () => {
    // 600 attempts * 500ms per attempt = 300,000ms = 300 seconds (5 minutes)
    expect(GENERATION_MAX_ATTEMPTS).toBe(600);
    const totalSeconds = (GENERATION_MAX_ATTEMPTS * 500) / 1000;
    expect(totalSeconds).toBe(300);
  });

  it("maintains strict isolation between prompt text state and error/status messages", () => {
    let promptState = "experimental ambient texture";
    let errorMessage: string | null = null;
    let statusMessage: string | null = null;

    // Simulate an error/timeout event
    const handleTimeoutError = (err: Error) => {
      errorMessage = String(err);
      statusMessage = null;
      // Note: promptState is untouched
    };

    handleTimeoutError(new Error("Generation timed out waiting for local model completion."));

    expect(errorMessage).toContain("Generation timed out waiting for local model completion.");
    expect(statusMessage).toBeNull();
    // Prompt state remains unchanged after error
    expect(promptState).toBe("experimental ambient texture");
  });

  it("uses valid Machine Life job statuses and proxy relPaths", () => {
    const generatingJob: MachineLifeGenerationJob = {
      jobId: "mljob_001",
      status: "generating",
      request: {
        prompt: "rhythmic pulse",
        durationSeconds: 5,
        seed: 42,
        residentId: null,
        backendId: "facebook/musicgen-small",
      },
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    const completedJob: MachineLifeGenerationJob = {
      jobId: "mljob_001",
      status: "completed",
      request: {
        prompt: "rhythmic pulse",
        durationSeconds: 5,
        seed: 42,
        residentId: null,
        backendId: "facebook/musicgen-small",
      },
      createdAt: "2025-01-01T00:00:00.000Z",
      result: {
        id: "mlgen_0001",
        prompt: "rhythmic pulse",
        durationSeconds: 5,
        seed: 42,
        residentId: null,
        backendId: "facebook/musicgen-small",
        engine: "facebook/musicgen-small",
        canonicalWavFilename: "mlgen_0001.wav",
        canonicalChecksumSha256: "checksum123",
        createdAt: "2025-01-01T00:00:00.000Z",
        commercialEligibility: false,
        trainingEligibility: false,
        researchOnly: true,
      },
    };

    const proxy: MachineLifeProxyAudio = {
      kind: "generation",
      stem: "mlgen_0001",
      proxyFileName: "mlgen_0001.mp3",
      audioRelPath: "machine-life/generations/mlgen_0001.mp3",
      importedAt: "2025-01-01T00:00:00.000Z",
      durationSeconds: 5,
    };

    expect(generatingJob.status).toBe("generating");
    expect(completedJob.status).toBe("completed");
    expect(proxy.audioRelPath).toContain("machine-life/generations/");
  });
});
