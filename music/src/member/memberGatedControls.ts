/**
 * BLACKBOOK Presentation Readiness -- NEW/PAGES-+ Signed-Out Disable V1.
 *
 * Every BLACKBOOK control that requires sign-in computes its own
 * `disabled` state the same way: `memberState.status !== "signedIn"`,
 * optionally combined with a local emptiness check (UNDO/CLEAR). Before
 * this module, that expression was written inline for UNDO and CLEAR only
 * -- NEW and the PAGES drawer's own "+" had no disabled state at all, even
 * though their own click handlers (`startNewPage`) already silently
 * no-op when signed out. A signed-out visitor saw two fully interactive-
 * looking buttons (one of them the PAGES drawer's own empty-state copy
 * literally says to press) that did nothing.
 *
 * This is the one shared, pure decision every sign-in-gated BLACKBOOK
 * control now reads -- never a second, independently-maintained copy of
 * the same condition. `blackbookRuntime.ts` has no test harness of its own
 * (DOM lookups at module load), so this is extracted into its own small
 * module for the same reason `pendingBakeLifecycle.ts` was: the smallest
 * pure decision seam necessary for deterministic testing.
 */
export interface MemberGatedControlsInput {
  readonly signedIn: boolean;
  /** Whether the active Artwork currently has any committed operations. */
  readonly hasOperations: boolean;
  /** CLEAR + Single-Step Undo V1 -- a pending clear-undo keeps UNDO enabled even with zero operations. */
  readonly hasPendingClearSnapshot: boolean;
}

export interface MemberGatedControlsState {
  readonly undoDisabled: boolean;
  readonly clearDisabled: boolean;
  readonly newDisabled: boolean;
  readonly pagesNewDisabled: boolean;
}

export function computeMemberGatedControlsState(
  input: MemberGatedControlsInput,
): MemberGatedControlsState {
  const signedOut = !input.signedIn;
  return {
    undoDisabled: signedOut || (!input.hasOperations && !input.hasPendingClearSnapshot),
    clearDisabled: signedOut || !input.hasOperations,
    newDisabled: signedOut,
    pagesNewDisabled: signedOut,
  };
}
