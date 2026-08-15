import { useEffect, useState } from "react";
import type {
  MachineLifeGeneratedOutput,
  MachineLifeGeneratorHealth,
} from "../../data/machineLifeTypes";
import {
  fetchGeneratedAudioBlob,
  fetchGeneratorHealth,
  intakeGeneratedAudioProxy,
  pollGenerationJob,
  submitGenerationJob,
} from "../../logic/machineLife/machineLifeGeneratorClient";
import { machineLifeProxyPlayUrl } from "../../logic/machineLife/machineLifeProxyImport";

interface Props {
  latestGeneration: MachineLifeGeneratedOutput | null;
  onSaveGeneration(generation: MachineLifeGeneratedOutput): void;
}

export const GENERATION_MAX_ATTEMPTS = 600; // 300s timeout ceiling at 500ms intervals

function randomSeed(): number {
  return Math.floor(Math.random() * 90000) + 10000;
}

export function MachineLifeGeneratePanel({ latestGeneration, onSaveGeneration }: Props) {
  const [health, setHealth] = useState<MachineLifeGeneratorHealth | null>(null);
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [seed, setSeed] = useState<number>(randomSeed);
  const [residentId, setResidentId] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkHealth = () => {
      fetchGeneratorHealth().then((h) => {
        if (mounted) setHealth(h);
      });
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  async function handleGenerate() {
    if (!prompt.trim()) {
      setErrorMessage("Prompt is required for generation.");
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setStatusMessage("Submitting generation request to local generator daemon…");

    try {
      const { jobId } = await submitGenerationJob({
        prompt: prompt.trim(),
        durationSeconds: Number(durationSeconds),
        seed: Number(seed),
        residentId: residentId.trim() ? residentId.trim() : null,
        backendId: health?.backendId ?? "facebook/musicgen-small",
      });

      setStatusMessage("Model is generating audio (AudioCraft MusicGen)…");

      let completedJob = false;
      let attempts = 0;

      while (!completedJob && attempts < GENERATION_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 500));
        attempts++;
        const job = await pollGenerationJob(jobId);

        if (job.status === "failed") {
          throw new Error(job.error ?? "Generation failed on the local service.");
        }

        if (job.status === "completed" && job.result) {
          completedJob = true;
          setStatusMessage("Ingesting generated audio proxy…");

          const audioBlob = await fetchGeneratedAudioBlob(jobId);
          const intakeRes = await intakeGeneratedAudioProxy(
            job.result,
            audioBlob,
            new Date().toISOString(),
          );

          const finalOutput: MachineLifeGeneratedOutput = {
            ...job.result,
            proxyAudio: intakeRes.proxy,
          };

          onSaveGeneration(finalOutput);
          setStatusMessage(`Generated ${finalOutput.id} successfully.`);
          setSeed(randomSeed());
        }
      }

      if (!completedJob) {
        throw new Error("Generation timed out waiting for local model completion.");
      }
    } catch (e) {
      setErrorMessage(String(e));
      setStatusMessage(null);
    } finally {
      setIsGenerating(false);
    }
  }

  const isOffline = health?.status === "offline" || !health;

  return (
    <section className="ml-generate-panel">
      {/* Service Health Banner */}
      <div className={`ml-status-banner ml-status-${health?.status ?? "offline"}`}>
        <div className="ml-status-indicator">
          <span className="ml-status-dot" />
          <strong>
            {health?.status === "online"
              ? "Generator Daemon Online"
              : health?.status === "busy"
                ? "Generator Daemon Busy"
                : "Generator Daemon Offline"}
          </strong>
        </div>
        <div className="ml-status-meta">
          <span>Backend: <code>{health?.backendId ?? "facebook/musicgen-small"}</code></span>
          <span>Device: <code>{health?.device ?? "unknown"}</code></span>
          <span>Model ready: <code>{health?.modelReady ? "yes" : "no"}</code></span>
        </div>
      </div>

      {isOffline && (
        <p className="ml-offline-notice">
          The external generator daemon is not reachable at <code>localhost:8000</code>.
          Start the daemon via <code>python /Users/studio/Projects/Machine_Life/generator/app.py</code>.
        </p>
      )}

      {/* Generation Form */}
      <div className="ml-generate-form">
        <h3>Generate Machine Life Audio</h3>
        <p className="ml-workspace-tagline">
          Learned AudioCraft MusicGen generation. Research outputs only — not Stage 0 deterministic collages.
        </p>

        <label>
          Prompt
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. deep rhythmic industrial pulse with atmospheric resonance"
            rows={3}
            disabled={isGenerating}
          />
        </label>

        <div className="ml-generate-form-row">
          <label>
            Resident (optional)
            <input
              type="text"
              value={residentId}
              onChange={(e) => setResidentId(e.target.value)}
              placeholder="None (unconditioned)"
              disabled={isGenerating}
            />
          </label>

          <label>
            Duration (seconds)
            <input
              type="number"
              min={1}
              max={30}
              step={1}
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(Number(e.target.value))}
              disabled={isGenerating}
            />
          </label>

          <label>
            Seed
            <div className="ml-seed-input-group">
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                disabled={isGenerating}
              />
              <button
                type="button"
                onClick={() => setSeed(randomSeed())}
                disabled={isGenerating}
                title="Randomize seed"
              >
                🎲
              </button>
            </div>
          </label>
        </div>

        <div className="ml-generate-actions">
          <button
            type="button"
            className="ml-generate-btn"
            onClick={handleGenerate}
            disabled={isGenerating || isOffline}
          >
            {isGenerating ? "Generating…" : "Generate"}
          </button>
          {statusMessage && <span className="ml-generate-status">{statusMessage}</span>}
          {errorMessage && <span className="ml-generate-error">{errorMessage}</span>}
        </div>
      </div>

      {/* Latest Generation Card */}
      {latestGeneration && (
        <section className="ml-latest-card">
          <header className="ml-latest-header">
            <h4>Latest Generation: {latestGeneration.id}</h4>
            <span className="ml-eligibility-badge">
              Research Only · Commercial: No · Training: No
            </span>
          </header>

          <div className="ml-latest-audio">
            {latestGeneration.proxyAudio ? (
              <audio
                controls
                src={machineLifeProxyPlayUrl(latestGeneration.proxyAudio)}
                style={{ width: "100%" }}
              />
            ) : (
              <p className="ml-detail-unavailable">Audio proxy not available for playback.</p>
            )}
          </div>

          <dl className="ml-detail-facts">
            <div>
              <dt>Prompt</dt>
              <dd>{latestGeneration.prompt}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{latestGeneration.durationSeconds}s</dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd>{latestGeneration.seed}</dd>
            </div>
            <div>
              <dt>Resident</dt>
              <dd>{latestGeneration.residentId ?? "None (unconditioned)"}</dd>
            </div>
            <div>
              <dt>Engine</dt>
              <dd>{latestGeneration.engine}</dd>
            </div>
            <div>
              <dt>Canonical WAV</dt>
              <dd>{latestGeneration.canonicalWavFilename}</dd>
            </div>
            <div>
              <dt>SHA-256 Checksum</dt>
              <dd className="ml-detail-checksum">{latestGeneration.canonicalChecksumSha256}</dd>
            </div>
            <div>
              <dt>Created At</dt>
              <dd>{new Date(latestGeneration.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
        </section>
      )}
    </section>
  );
}
