import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MachineLifeGeneratePanel } from "./MachineLifeGeneratePanel";
import * as client from "../../logic/machineLife/machineLifeGeneratorClient";

vi.mock("../../logic/machineLife/machineLifeGeneratorClient");

describe("MachineLifeGeneratePanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(client, "fetchGeneratorHealth").mockResolvedValue({
      status: "online",
      backendId: "facebook/musicgen-small",
      device: "mps",
      modelReady: true,
    });
  });

  it("preserves user prompt text when error or timeout occurs", async () => {
    vi.spyOn(client, "submitGenerationJob").mockRejectedValue(
      new Error("Generation timed out waiting for local model completion.")
    );

    render(<MachineLifeGeneratePanel latestGeneration={null} onSaveGeneration={vi.fn()} />);

    const textarea = (await screen.findByPlaceholderText(
      /deep rhythmic industrial pulse/i
    )) as HTMLTextAreaElement;

    const userPrompt = "experimental ambient texture";
    fireEvent.change(textarea, { target: { value: userPrompt } });

    const generateBtn = screen.getByRole("button", { name: "Generate" });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Generation timed out waiting for local model completion/i)).toBeInTheDocument();
    });

    expect(textarea.value).toBe(userPrompt);
  });
});
