import { describe, it, expect, vi } from "vitest";
import { runSectionalRadioBridgePromotion, type SectionalRadioBridgePromotionDeps } from "./sectionalRadioBridgeOrchestrator";
import type { LoopAsset } from "../../data/loopTypes";
import type { PromoteLoopToRadioResult } from "./radioPromotionOrchestrator";
import type { RadioPromotionFormInput } from "../../data/radioLoopTypes";

function loop(overrides: Partial<LoopAsset> = {}): LoopAsset {
  return {
    id: "loop_1", sourceKind: "track", sourceTrackId: "track_a",
    startSeconds: 1, endSeconds: 2, durationSeconds: 1,
    status: "candidate", boundarySource: "manual", contentClass: "unknown",
    generationMode: "manual_only", provisional: false, sectionLabel: "Manual",
    seamlessnessScore: 0.5, confidence: 0.5, createdAt: "x", updatedAt: "x",
    ...overrides,
  } as LoopAsset;
}

const formInput: RadioPromotionFormInput = { arrangementRole: "foundation", publicUseApproved: true };
const okResult: PromoteLoopToRadioResult = { ok: true, radioLoopId: "rloop_000001", packageVersion: 1, issues: [] };

describe("runSectionalRadioBridgePromotion", () => {
  it("create_new: calls onSaveLoop exactly once, then promotes", async () => {
    const previewLoop = loop({ id: "loop_new", status: "approved" });
    const onSaveLoop = vi.fn();
    const onUpdateLoop = vi.fn();
    const onPromoteToRadio = vi.fn().mockResolvedValue(okResult);
    const deps: SectionalRadioBridgePromotionDeps = {
      resolution: { mode: "create_new" }, previewLoop,
      materializedLoopIdRef: { current: null },
      onSaveLoop, onUpdateLoop, onPromoteToRadio,
    };

    const result = await runSectionalRadioBridgePromotion(deps, "loop_new", formInput);

    expect(onSaveLoop).toHaveBeenCalledTimes(1);
    expect(onSaveLoop).toHaveBeenCalledWith(previewLoop);
    expect(onUpdateLoop).not.toHaveBeenCalled();
    expect(onPromoteToRadio).toHaveBeenCalledWith("loop_new", formInput, undefined);
    expect(result).toEqual(okResult);
  });

  it("reuse_approved: never calls onSaveLoop or onUpdateLoop", async () => {
    const onSaveLoop = vi.fn();
    const onUpdateLoop = vi.fn();
    const onPromoteToRadio = vi.fn().mockResolvedValue(okResult);
    const deps: SectionalRadioBridgePromotionDeps = {
      resolution: { mode: "reuse_approved", loopId: "loop_existing" }, previewLoop: null,
      materializedLoopIdRef: { current: null },
      onSaveLoop, onUpdateLoop, onPromoteToRadio,
    };

    await runSectionalRadioBridgePromotion(deps, "loop_existing", formInput);

    expect(onSaveLoop).not.toHaveBeenCalled();
    expect(onUpdateLoop).not.toHaveBeenCalled();
    expect(onPromoteToRadio).toHaveBeenCalledWith("loop_existing", formInput, undefined);
  });

  it("reuse_needs_approval: calls onUpdateLoop with status approved, never onSaveLoop", async () => {
    const onSaveLoop = vi.fn();
    const onUpdateLoop = vi.fn();
    const onPromoteToRadio = vi.fn().mockResolvedValue(okResult);
    const deps: SectionalRadioBridgePromotionDeps = {
      resolution: { mode: "reuse_needs_approval", loopId: "loop_existing" }, previewLoop: null,
      materializedLoopIdRef: { current: null },
      onSaveLoop, onUpdateLoop, onPromoteToRadio,
    };

    await runSectionalRadioBridgePromotion(deps, "loop_existing", formInput);

    expect(onSaveLoop).not.toHaveBeenCalled();
    expect(onUpdateLoop).toHaveBeenCalledTimes(1);
    expect(onUpdateLoop).toHaveBeenCalledWith("loop_existing", { status: "approved" });
  });

  it("Retry idempotency: a second call with the same materializedLoopIdRef does not mutate again", async () => {
    const previewLoop = loop({ id: "loop_new", status: "approved" });
    const onSaveLoop = vi.fn();
    const onUpdateLoop = vi.fn();
    const onPromoteToRadio = vi.fn()
      .mockResolvedValueOnce({ ok: false, issues: [{ code: "X", message: "fail", severity: "error" as const }] })
      .mockResolvedValueOnce(okResult);
    const materializedLoopIdRef = { current: null as string | null };
    const deps: SectionalRadioBridgePromotionDeps = {
      resolution: { mode: "create_new" }, previewLoop,
      materializedLoopIdRef,
      onSaveLoop, onUpdateLoop, onPromoteToRadio,
    };

    const first = await runSectionalRadioBridgePromotion(deps, "loop_new", formInput);
    expect(first.ok).toBe(false);
    const second = await runSectionalRadioBridgePromotion(deps, "loop_new", formInput);
    expect(second.ok).toBe(true);

    expect(onSaveLoop).toHaveBeenCalledTimes(1);
    expect(onPromoteToRadio).toHaveBeenCalledTimes(2);
  });

  it("reuse_needs_approval Retry idempotency: onUpdateLoop is called exactly once across two attempts", async () => {
    const onSaveLoop = vi.fn();
    const onUpdateLoop = vi.fn();
    const onPromoteToRadio = vi.fn()
      .mockResolvedValueOnce({ ok: false, issues: [] })
      .mockResolvedValueOnce(okResult);
    const materializedLoopIdRef = { current: null as string | null };
    const deps: SectionalRadioBridgePromotionDeps = {
      resolution: { mode: "reuse_needs_approval", loopId: "loop_existing" }, previewLoop: null,
      materializedLoopIdRef,
      onSaveLoop, onUpdateLoop, onPromoteToRadio,
    };

    await runSectionalRadioBridgePromotion(deps, "loop_existing", formInput);
    await runSectionalRadioBridgePromotion(deps, "loop_existing", formInput);

    expect(onUpdateLoop).toHaveBeenCalledTimes(1);
  });

  // The regression the user explicitly required before approving 0717B:
  // handleUpdateLoop (App.tsx) mutates its backing array synchronously
  // before promotion is called — assert the promotion call observes
  // status: "approved" within the SAME operation, no separate re-render/
  // re-fetch relied upon. This stub mirrors that real synchronous-ref
  // behavior exactly (mutate array in place, no await, no setState).
  it("reuse_needs_approval: onPromoteToRadio observes status 'approved' synchronously, in the same operation", async () => {
    const sharedLoops: LoopAsset[] = [loop({ id: "loop_existing", status: "candidate" })];
    function stubOnUpdateLoop(loopId: string, patch: Partial<LoopAsset>) {
      const idx = sharedLoops.findIndex((l) => l.id === loopId);
      sharedLoops[idx] = { ...sharedLoops[idx], ...patch }; // synchronous, matches handleUpdateLoop's ref-before-setState behavior
    }
    let observedStatusAtPromoteTime: string | undefined;
    async function stubOnPromoteToRadio(loopId: string): Promise<PromoteLoopToRadioResult> {
      observedStatusAtPromoteTime = sharedLoops.find((l) => l.id === loopId)?.status;
      return okResult;
    }
    const deps: SectionalRadioBridgePromotionDeps = {
      resolution: { mode: "reuse_needs_approval", loopId: "loop_existing" }, previewLoop: null,
      materializedLoopIdRef: { current: null },
      onSaveLoop: vi.fn(), onUpdateLoop: stubOnUpdateLoop, onPromoteToRadio: stubOnPromoteToRadio,
    };

    await runSectionalRadioBridgePromotion(deps, "loop_existing", formInput);

    expect(observedStatusAtPromoteTime).toBe("approved");
  });
});
