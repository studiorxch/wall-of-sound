// 0828_MUSIC_Looper_Loop_Library_Tagging §Phase E — Machine Life training
// annotation, deliberately in its own dialog (not an inline table cell like
// Purpose/Tags/Notes): the spec's own wording distinguishes Notes (never
// buried) from this group (may be secondary), and the field set here is
// too large for a table cell — reuses the existing npw-* modal CSS system,
// same as PromoteToRadioDialog. Additive, separate from general Loop tags;
// never touches asset.tags or any other field, only machineLifeAnnotation.

import { useState } from "react";
import type { LoopAsset, LoopMachineLifeAnnotation } from "../../data/loopTypes";

type Props = {
  loop: LoopAsset;
  onSave: (annotation: LoopMachineLifeAnnotation) => void;
  onClose: () => void;
};

const REVIEW_STATUSES: NonNullable<LoopMachineLifeAnnotation["reviewStatus"]>[] = ["unreviewed", "reviewed", "rejected"];

function toCsv(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}
function fromCsv(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

export function LoopMachineLifeAnnotationDialog({ loop, onSave, onClose }: Props) {
  const existing = loop.machineLifeAnnotation;
  const [trainingEligible, setTrainingEligible] = useState<boolean | undefined>(existing?.trainingEligible);
  const [learningPurpose, setLearningPurpose] = useState(toCsv(existing?.learningPurpose));
  const [materialRole, setMaterialRole] = useState(toCsv(existing?.materialRole));
  const [behaviorTags, setBehaviorTags] = useState(toCsv(existing?.behaviorTags));
  const [trainingNotes, setTrainingNotes] = useState(existing?.trainingNotes ?? "");
  const [reviewStatus, setReviewStatus] = useState<LoopMachineLifeAnnotation["reviewStatus"]>(existing?.reviewStatus);

  function handleSave() {
    onSave({
      trainingEligible,
      learningPurpose: fromCsv(learningPurpose),
      materialRole: fromCsv(materialRole),
      behaviorTags: fromCsv(behaviorTags),
      trainingNotes: trainingNotes.trim() || undefined,
      reviewStatus,
    });
  }

  return (
    <div className="npw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="npw-modal">
        <div className="npw-header">
          <div className="npw-header-title">Machine Life Annotation — {loop.title}</div>
          <button className="npw-close" onClick={onClose}>✕</button>
        </div>
        <div className="npw-body">
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "0 0 12px" }}>
            Additive and separate from this loop's general tags — used only for Machine Life training review, never for musical retrieval.
          </p>

          <div className="npw-step-label">Training eligible</div>
          <select
            value={trainingEligible === undefined ? "" : String(trainingEligible)}
            onChange={(e) => setTrainingEligible(e.target.value === "" ? undefined : e.target.value === "true")}
            style={{ width: "100%", marginBottom: 10 }}
          >
            <option value="">Not set</option>
            <option value="true">Eligible</option>
            <option value="false">Not eligible</option>
          </select>

          <div className="npw-step-label">Learning purpose (comma-separated)</div>
          <input value={learningPurpose} onChange={(e) => setLearningPurpose(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

          <div className="npw-step-label">Material role (comma-separated)</div>
          <input value={materialRole} onChange={(e) => setMaterialRole(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

          <div className="npw-step-label">Behavior tags (comma-separated)</div>
          <input value={behaviorTags} onChange={(e) => setBehaviorTags(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

          <div className="npw-step-label">Training notes</div>
          <textarea value={trainingNotes} onChange={(e) => setTrainingNotes(e.target.value)} style={{ width: "100%", minHeight: 60, marginBottom: 10 }} />

          <div className="npw-step-label">Review status</div>
          <select value={reviewStatus ?? ""} onChange={(e) => setReviewStatus(e.target.value === "" ? undefined : e.target.value as LoopMachineLifeAnnotation["reviewStatus"])} style={{ width: "100%" }}>
            <option value="">Not set</option>
            {REVIEW_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="npw-footer">
          <button className="npw-btn npw-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="npw-btn npw-btn--primary" onClick={handleSave}>Save Annotation</button>
        </div>
      </div>
    </div>
  );
}
