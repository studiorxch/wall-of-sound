import { resetPanInteraction, type PanInteractionState, type PanSource } from "./WallView";

export interface InteractionAuthorityInput<T extends string> {
  activeDrawingTool: T;
  sprayIntent: boolean;
  panInteraction: PanInteractionState;
  panPointerActive: boolean;
}

export interface InteractionAuthority<T extends string> {
  normalizedPan: PanInteractionState;
  normalized: boolean;
  navigationOwner: PanSource;
  panGestureActive: boolean;
  panVisualActive: boolean;
  effectiveTool: T | "pan";
  paintAllowed: boolean;
  sprayAudioAllowed: boolean;
  paintSuppressed: boolean;
}

export function resolveInteractionAuthority<T extends string>(
  input: InteractionAuthorityInput<T>,
): InteractionAuthority<T> {
  const sourceWithoutPointer = input.panInteraction.source !== null && !input.panPointerActive;
  const normalized = sourceWithoutPointer;
  const normalizedPan = normalized ? resetPanInteraction() : input.panInteraction;
  const panGestureActive = normalizedPan.source !== null && input.panPointerActive;
  const paintAllowed = input.sprayIntent && !panGestureActive;

  return {
    normalizedPan,
    normalized,
    navigationOwner: panGestureActive ? normalizedPan.source : null,
    panGestureActive,
    panVisualActive: panGestureActive,
    effectiveTool: panGestureActive ? "pan" : input.activeDrawingTool,
    paintAllowed,
    sprayAudioAllowed: paintAllowed,
    paintSuppressed: input.sprayIntent && !paintAllowed,
  };
}
