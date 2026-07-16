// Playlist Analyzer Review — "Export for GPT" panel (spec §8, §10).

import { useMemo, useState } from "react";
import type { PlaylistAnalyzerReview } from "../../data/playlistAnalyzerTypes";
import type { RepairExportInput } from "../../logic/playlistRepair/repairExport";
import { buildGptExportMarkdown, buildGptExportFilename } from "../../logic/playlistAnalyzer/gptExport";

type Props = {
  review: PlaylistAnalyzerReview;
  repair?: RepairExportInput;
  preparation?: import("../../data/playProjectTypes").PlaylistRecord["playbackPreparation"];
};

function todayMMDD(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function PlaylistAnalyzerExportPanel({ review, repair, preparation }: Props) {
  const [copied, setCopied] = useState(false);
  const markdown = useMemo(() => buildGptExportMarkdown(review, repair, preparation), [review, repair, preparation]);
  const filename = useMemo(() => buildGptExportFilename(review, todayMMDD()), [review]);

  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    await navigator.clipboard?.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="par-section">
      <div className="par-export-actions">
        <button className="tb-btn" onClick={download}>↓ Export for GPT ({filename})</button>
        <button className="tb-btn" onClick={copy}>{copied ? "Copied" : "Copy Markdown"}</button>
      </div>
      <div className="par-note">
        Measured values (BPM, key, duration, energy) are read directly from track analysis. Inferred values (mood, texture, role, transition type) are derived and carry a confidence score. Interpreted language (theme, visual concept, motion direction) is creative translation — not measured fact.
      </div>
      <pre className="par-export-preview">{markdown}</pre>
    </div>
  );
}
