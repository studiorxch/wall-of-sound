// RadioLoop Library Workspace (0717A) — pure version comparison (decision
// 8). Never claims audio changed just because the version NUMBER changed
// (spec §8.5) — only when declared asset identity fields actually differ,
// which they never do for a pure metadata revision (the source's exact
// primary/stems fields are carried forward unchanged by
// radioMetadataRevisionOrchestrator.ts).

import type { RadioLoopPackageManifest } from "../../data/radioLoopTypes";

export interface RadioLoopVersionDiff {
  arrangementChanged: boolean;
  approvalChanged: boolean;
  musicalChanged: boolean;
  audioIdentityChanged: boolean;
  stemSetChanged: boolean;
  changedFields: string[];
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function compareRadioLoopVersions(a: RadioLoopPackageManifest, b: RadioLoopPackageManifest): RadioLoopVersionDiff {
  const changedFields: string[] = [];

  const arrangementChanged = !deepEqual(a.arrangement, b.arrangement);
  if (arrangementChanged) changedFields.push("arrangement");

  const approvalChanged = !deepEqual(a.approval, b.approval);
  if (approvalChanged) changedFields.push("approval");

  const musicalChanged = !deepEqual(a.musical, b.musical);
  if (musicalChanged) changedFields.push("musical");

  const titleChanged = a.title !== b.title;
  if (titleChanged) changedFields.push("title");

  const audioIdentityChanged = !deepEqual(a.audio.primary, b.audio.primary) || !deepEqual(a.audio.variants, b.audio.variants);
  if (audioIdentityChanged) changedFields.push("audio");

  const stemSetChanged = !deepEqual(a.stems ?? [], b.stems ?? []);
  if (stemSetChanged) changedFields.push("stems");

  return { arrangementChanged, approvalChanged, musicalChanged, audioIdentityChanged, stemSetChanged, changedFields };
}
