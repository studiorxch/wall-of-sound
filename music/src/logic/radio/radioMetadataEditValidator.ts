// RadioLoop Library Workspace (0717A) — pure client-side mirror of the
// server's metadata-edit validation (decision "8.6"). Supplements but
// never replaces server validation (radioMetadataRevisionOrchestrator.ts's
// validateMetadataEditRequest is the authority) — this exists purely so
// the dialog can show issues before ever making a network round trip.

import { isValidRadioArrangementRole } from "../../data/radioLoopTypes";
import type { RadioLoopMetadataEditRequest } from "../../data/radioWorkspaceTypes";
import type { RadioValidationIssue } from "../../data/radioLoopTypes";

export function validateMetadataEditRequest(request: RadioLoopMetadataEditRequest, originalPublicUseApproved: boolean): RadioValidationIssue[] {
  const issues: RadioValidationIssue[] = [];

  if (!request.roles || request.roles.length === 0) {
    issues.push({ code: "RADIO_EDIT_ROLE_REQUIRED", message: "At least one role is required", severity: "error" });
  } else {
    for (const role of request.roles) {
      if (!isValidRadioArrangementRole(role)) {
        issues.push({ code: "RADIO_EDIT_UNKNOWN_ROLE", message: `"${role}" is not a valid RADIO role`, severity: "error" });
      }
    }
  }

  // 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map §3.4 — no
  // Compatibility Family requirement.

  for (const [label, value] of [["energy", request.energy], ["density", request.density], ["stability", request.stability]] as const) {
    if (value != null && (value < 0 || value > 1)) {
      issues.push({ code: "RADIO_EDIT_FIELD_OUT_OF_RANGE", message: `${label} must be between 0 and 1`, severity: "error" });
    }
  }

  if (request.maximumConsecutiveRepeats != null && (!Number.isInteger(request.maximumConsecutiveRepeats) || request.maximumConsecutiveRepeats < 1)) {
    issues.push({ code: "RADIO_EDIT_FIELD_OUT_OF_RANGE", message: "Max consecutive repeats must be an integer >= 1", severity: "error" });
  }
  if (request.minimumRestCycles != null && (!Number.isInteger(request.minimumRestCycles) || request.minimumRestCycles < 0)) {
    issues.push({ code: "RADIO_EDIT_FIELD_OUT_OF_RANGE", message: "Min rest cycles must be an integer >= 0", severity: "error" });
  }

  // §9.6 — public-use approval changes require explicit confirmation.
  if (request.publicUseApproved !== originalPublicUseApproved && !request.approvalChangeConfirmed) {
    issues.push({ code: "RADIO_EDIT_APPROVAL_CHANGE_UNCONFIRMED", message: "Changing public-use approval requires explicit confirmation", severity: "error" });
  }

  return issues;
}
