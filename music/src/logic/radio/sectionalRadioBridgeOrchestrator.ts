// Sectional Looper Radio Export Bridge (0717B) — the materialize-then-
// promote sequence extracted out of SectionalLooperWorkspace.tsx's own
// onPromote callback into a plain, testable function (no React). This
// codebase has no React-component test harness (no @testing-library/react,
// no jsdom/happy-dom environment) — every existing test in this repo is
// against a pure function, so the part of the bridge requiring dedicated
// regression coverage (deferred LoopAsset creation/approval, Retry
// idempotency, and the synchronous-observation guarantee plan Decision 3's
// "Verified synchronous-ref guarantee" section requires) lives here instead
// of inside the component.
//
// LoopAsset creation/approval is deferred to exactly this call — the
// moment the user clicks "Promote to Radio" inside the dialog, never at
// menu-select or dialog-open time (spec §7.5). `materializedLoopIdRef`
// guards a Retry from mutating a second time.

import type { LoopAsset } from "../../data/loopTypes";
import type { RadioPromotionFormInput } from "../../data/radioLoopTypes";
import type { PromoteLoopToRadioResult, RadioPromotionPhase } from "./radioPromotionOrchestrator";
import type { SectionalRadioSourceResolution } from "../../data/sectionalRadioBridgeTypes";

export interface SectionalRadioBridgePromotionDeps {
  resolution: SectionalRadioSourceResolution;
  // The unsaved preview LoopAsset built for the "create_new" case only;
  // unused (and may be null) for reuse_approved/reuse_needs_approval.
  previewLoop: LoopAsset | null;
  materializedLoopIdRef: { current: string | null };
  onSaveLoop: (loop: LoopAsset) => void;
  onUpdateLoop: (loopId: string, patch: Partial<LoopAsset>) => void;
  onPromoteToRadio: (
    loopId: string,
    formInput: RadioPromotionFormInput,
    onProgress?: (phase: RadioPromotionPhase) => void,
  ) => Promise<PromoteLoopToRadioResult>;
}

export async function runSectionalRadioBridgePromotion(
  deps: SectionalRadioBridgePromotionDeps,
  loopId: string,
  formInput: RadioPromotionFormInput,
  onProgress?: (phase: RadioPromotionPhase) => void,
): Promise<PromoteLoopToRadioResult> {
  const { resolution, previewLoop, materializedLoopIdRef, onSaveLoop, onUpdateLoop, onPromoteToRadio } = deps;

  if (!materializedLoopIdRef.current) {
    if (resolution.mode === "create_new" && previewLoop) {
      onSaveLoop(previewLoop);
    } else if (resolution.mode === "reuse_needs_approval") {
      // Plan Decision 3a — the same status-mutation authority
      // LoopLibraryView's Archive action already uses (onUpdateLoop,
      // synchronous against the caller's own loop store before this promise
      // resolves), not an ad-hoc field assignment. reuse_approved never
      // reaches either branch — zero mutation for the common case.
      onUpdateLoop(resolution.loopId, { status: "approved" });
    }
    materializedLoopIdRef.current = loopId;
  }

  return onPromoteToRadio(loopId, formInput, onProgress);
}
