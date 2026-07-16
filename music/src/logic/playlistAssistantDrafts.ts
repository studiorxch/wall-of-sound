// Playlist Assistant draft builders (0705O)
// All functions are local/non-destructive — they produce text output only.

export type PlaylistAssistantDraftType =
  | "smooth_transitions"
  | "extend_duration"
  | "replace_warnings"
  | "better_opener"
  | "better_closer"
  | "write_description"
  | "alternate_version"
  | "export_copy"
  | "custom_prompt";

export type PlaylistAssistantDraftSection = {
  heading: string;
  body: string;
  bullets?: string[];
};

export type PlaylistAssistantDraft = {
  draftId: string;
  type: PlaylistAssistantDraftType;
  createdAt: string;
  title: string;
  summary: string;
  sections: PlaylistAssistantDraftSection[];
};

export type PlaylistAssistantContext = {
  playlistTitle: string;
  trackCount: number;
  durationDisplay: string;
  durationSeconds: number;
  crateNames: string[];
  crateTrackCount: number;
  readinessGrade: string;
  bpmRange: string;
  bpmMin: number | null;
  bpmMax: number | null;
  keySummary: string;
  energyRange: string;
  energyMin: number | null;
  energyMax: number | null;
  warningCount: number;
  nextCandidateCount: number;
  openerTrack: string | null;
  closerTrack: string | null;
  notes: string;
};

let _idSeq = 0;
function newId(): string {
  return `draft_${Date.now()}_${++_idSeq}`;
}

function now(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Draft builders ─────────────────────────────────────────────────────────────

export function buildSmoothTransitionsDraft(ctx: PlaylistAssistantContext): PlaylistAssistantDraft {
  const hasWarnings = ctx.warningCount > 0;
  const sections: PlaylistAssistantDraftSection[] = [
    {
      heading: "Current state",
      body: `${ctx.playlistTitle}: ${ctx.trackCount} tracks, ${ctx.durationDisplay}, BPM ${ctx.bpmRange}.`,
      bullets: [
        `Keys: ${ctx.keySummary}`,
        `Energy: ${ctx.energyRange}`,
        `${ctx.warningCount} warning track${ctx.warningCount !== 1 ? "s" : ""}`,
      ],
    },
    {
      heading: "Suggested approach",
      body: hasWarnings
        ? `${ctx.warningCount} transition point${ctx.warningCount !== 1 ? "s" : ""} should be reviewed. Look for inline BPM and key warnings in the playlist table.`
        : "No current warnings. This playlist's transitions look clean.",
      bullets: hasWarnings ? [
        "Find the rows with BPM or KEY warning chips in the table",
        `Look for replacement candidates near the surrounding BPM (target range: ${ctx.bpmRange})`,
        `Preserve key lane ${ctx.keySummary} when possible`,
        `Prefer energy ${ctx.energyRange} for replacements`,
        `${ctx.nextCandidateCount} candidates available in the crate pool`,
      ] : [
        "Consider using Options → Generate to find alternative path arrangements",
        "Crate pool has " + ctx.nextCandidateCount + " candidates if you want to explore",
      ],
    },
    {
      heading: "Next steps",
      body: "Use the Crate Pool tab to browse replacements, or Options to regenerate a new path.",
    },
  ];
  return {
    draftId: newId(),
    type: "smooth_transitions",
    createdAt: now(),
    title: "Smooth Transition Plan",
    summary: hasWarnings
      ? `${ctx.warningCount} transition point${ctx.warningCount !== 1 ? "s" : ""} to review in "${ctx.playlistTitle}".`
      : `Transitions look clean in "${ctx.playlistTitle}".`,
    sections,
  };
}

export function buildExtendDurationDraft(ctx: PlaylistAssistantContext): PlaylistAssistantDraft {
  const currentMin = Math.round(ctx.durationSeconds / 60);
  const targetMin = 120;
  const diffMin = targetMin - currentMin;
  const over = diffMin < 0;
  const avgTrackSec = ctx.trackCount > 0 ? ctx.durationSeconds / ctx.trackCount : 240;
  const tracksNeeded = over ? 0 : Math.ceil((diffMin * 60) / avgTrackSec);

  const sections: PlaylistAssistantDraftSection[] = [
    {
      heading: "Duration analysis",
      body: `Current: ${ctx.durationDisplay}. Target: 2h 0m.`,
      bullets: over
        ? [`Playlist is already ${Math.abs(diffMin)}m over 2 hours.`]
        : [`Approximately ${diffMin}m short of target.`, `Estimated ${tracksNeeded} track${tracksNeeded !== 1 ? "s" : ""} needed (at ~${Math.round(avgTrackSec / 60)}m avg).`],
    },
    {
      heading: over ? "Trim suggestion" : "Extension suggestion",
      body: over
        ? "Consider removing lower-priority tracks near the end, or accept the longer runtime for broadcast."
        : `Add ${tracksNeeded} track${tracksNeeded !== 1 ? "s" : ""} from the ${ctx.nextCandidateCount} crate candidates.`,
      bullets: over ? [
        "Review the closing section for natural cut points",
        "Prefer removing tracks with warnings first",
      ] : [
        `Match BPM ${ctx.bpmRange} for continuity`,
        `Maintain key ${ctx.keySummary} or compatible adjacent keys`,
        `${ctx.nextCandidateCount} candidates available in the crate`,
        "Insert near the end or at a natural energy transition",
      ],
    },
  ];
  return {
    draftId: newId(),
    type: "extend_duration",
    createdAt: now(),
    title: over ? "Duration Trim Plan" : "Extend to 2h Plan",
    summary: over
      ? `"${ctx.playlistTitle}" is ${Math.abs(diffMin)}m over 2h — consider trimming.`
      : `"${ctx.playlistTitle}" needs ~${diffMin}m more (${tracksNeeded} tracks) to reach 2h.`,
    sections,
  };
}

export function buildReplaceWarningsDraft(ctx: PlaylistAssistantContext): PlaylistAssistantDraft {
  const none = ctx.warningCount === 0;
  const sections: PlaylistAssistantDraftSection[] = none
    ? [{ heading: "No warnings found", body: `"${ctx.playlistTitle}" currently has no warning tracks. This playlist does not need replacement for warnings.` }]
    : [
      {
        heading: `${ctx.warningCount} warning track${ctx.warningCount !== 1 ? "s" : ""} identified`,
        body: "Review the playlist table — rows with inline BPM, KEY, or NRG chips indicate where issues occur.",
        bullets: [
          "BPM JUMP — large tempo shift from the previous track",
          "KEY — key incompatibility with the surrounding tracks",
          "NRG — energy spike or drop out of curve range",
        ],
      },
      {
        heading: "Replacement criteria",
        body: `Use the Crate Pool tab to search ${ctx.nextCandidateCount} candidates.`,
        bullets: [
          `Match BPM close to surrounding tracks (range: ${ctx.bpmRange})`,
          `Compatible key in ${ctx.keySummary} lane`,
          `Energy ${ctx.energyRange}`,
          "Remove the warning track using the × button, then drag a replacement into position",
        ],
      },
      {
        heading: "Alternative",
        body: "Use Options → Generate to find a new path with fewer warnings. The generator can find paths that naturally avoid BPM/key clashes.",
      },
    ];
  return {
    draftId: newId(),
    type: "replace_warnings",
    createdAt: now(),
    title: none ? "No Warning Tracks" : "Replace Warning Tracks Plan",
    summary: none
      ? `No warnings in "${ctx.playlistTitle}".`
      : `${ctx.warningCount} warning track${ctx.warningCount !== 1 ? "s" : ""} to address in "${ctx.playlistTitle}".`,
    sections,
  };
}

export function buildBetterOpenerDraft(ctx: PlaylistAssistantContext): PlaylistAssistantDraft {
  const sections: PlaylistAssistantDraftSection[] = [
    {
      heading: "Current opener",
      body: ctx.openerTrack
        ? `Opening track: ${ctx.openerTrack}`
        : "Opener data not available — check the first row in the playlist table.",
    },
    {
      heading: "Opener criteria",
      body: "A strong opener sets the identity and energy level for the whole set.",
      bullets: [
        "Lower or medium energy to let the set build",
        `Compatible key — preferably ${ctx.keySummary}`,
        "Stable BPM — no abrupt tempo introduction",
        "Strong identity — recognizable or distinctive enough to set the mood",
        "Clean intro — ideally no sudden percussion drop",
      ],
    },
    {
      heading: "Search strategy",
      body: `Browse ${ctx.nextCandidateCount} crate candidates.`,
      bullets: [
        `Filter for BPM near low end of range: ${ctx.bpmMin !== null ? Math.round(ctx.bpmMin) : "—"}`,
        `Key: ${ctx.keySummary} or adjacent Camelot position`,
        `Energy: ${ctx.energyMin !== null ? ctx.energyMin.toFixed(1) : "—"} or lower`,
        "Lock the opener slot after placement to protect it during regeneration",
      ],
    },
  ];
  return {
    draftId: newId(),
    type: "better_opener",
    createdAt: now(),
    title: "Find Better Opener",
    summary: `Opener search criteria for "${ctx.playlistTitle}" (${ctx.trackCount} tracks, ${ctx.durationDisplay}).`,
    sections,
  };
}

export function buildBetterCloserDraft(ctx: PlaylistAssistantContext): PlaylistAssistantDraft {
  const sections: PlaylistAssistantDraftSection[] = [
    {
      heading: "Current closer",
      body: ctx.closerTrack
        ? `Closing track: ${ctx.closerTrack}`
        : "Closer data not available — check the last row in the playlist table.",
    },
    {
      heading: "Closer strategy",
      body: "Choose a closing style that fits the set's arc.",
      bullets: [
        "Soft landing — gradual energy drop, spacious texture",
        "Peak ending — highest energy moment as the finale",
        "Loopable ending — works for broadcast/repeat contexts",
        "Broadcast-friendly fadeout — clean ending with no abrupt cut",
      ],
    },
    {
      heading: "Search strategy",
      body: `Browse ${ctx.nextCandidateCount} crate candidates.`,
      bullets: [
        `BPM near ${ctx.bpmMax !== null ? Math.round(ctx.bpmMax) : "—"} or stepping down from it`,
        `Key: ${ctx.keySummary} or a natural resolution`,
        "Lock the closer slot after placement to protect it during regeneration",
      ],
    },
  ];
  return {
    draftId: newId(),
    type: "better_closer",
    createdAt: now(),
    title: "Find Better Closer",
    summary: `Closer search criteria for "${ctx.playlistTitle}" (${ctx.trackCount} tracks, ${ctx.durationDisplay}).`,
    sections,
  };
}

export function buildDescriptionDraft(ctx: PlaylistAssistantContext): PlaylistAssistantDraft {
  const qualityWord = ctx.warningCount === 0 ? "clean" : ctx.warningCount <= 3 ? "mostly smooth" : "raw";
  const bpmDesc = ctx.bpmMin !== null && ctx.bpmMax !== null
    ? ctx.bpmMin === ctx.bpmMax
      ? `locked at ${Math.round(ctx.bpmMin)} BPM`
      : `moving between ${Math.round(ctx.bpmMin)} and ${Math.round(ctx.bpmMax)} BPM`
    : "";
  const keyDesc = ctx.keySummary !== "—" ? `${ctx.keySummary} harmonic lane` : "";
  const parts = [bpmDesc, keyDesc].filter(Boolean);
  const arc = parts.length > 0 ? ` The sequence is ${qualityWord}, ${parts.join(", ")}.` : "";

  const short = `A ${ctx.trackCount}-track playlist from ${ctx.crateNames.length > 0 ? ctx.crateNames.join(" / ") : "the crate"}.${arc}`;
  const long = `${short} Running ${ctx.durationDisplay}${ctx.energyRange !== "—" ? `, energy ${ctx.energyRange}` : ""}. Built for focused listening.`;

  const sections: PlaylistAssistantDraftSection[] = [
    { heading: "Short description", body: short },
    { heading: "Long description", body: long },
    {
      heading: "Tags / descriptors",
      body: "Suggested tags based on playlist metadata:",
      bullets: [
        ...(ctx.crateNames.length > 0 ? ctx.crateNames : []),
        ...(ctx.keySummary !== "—" ? [ctx.keySummary] : []),
        ...(ctx.bpmMin !== null ? [`${Math.round(ctx.bpmMin)}–${Math.round(ctx.bpmMax!)} BPM`] : []),
        ctx.durationDisplay,
      ].filter(Boolean),
    },
  ];
  return {
    draftId: newId(),
    type: "write_description",
    createdAt: now(),
    title: "Playlist Description Draft",
    summary: `Description draft for "${ctx.playlistTitle}".`,
    sections,
  };
}

export function buildAlternateVersionDraft(ctx: PlaylistAssistantContext): PlaylistAssistantDraft {
  const sections: PlaylistAssistantDraftSection[] = [
    {
      heading: "Source playlist",
      body: `${ctx.playlistTitle}: ${ctx.trackCount} tracks, ${ctx.durationDisplay}, BPM ${ctx.bpmRange}, keys ${ctx.keySummary}.`,
    },
    {
      heading: "Possible alternate versions",
      body: "Choose a direction for the alternate:",
      bullets: [
        `Smoother — regenerate with higher mix quality target, prioritize ${ctx.keySummary} compatibility`,
        `Longer (2h) — add ~${Math.max(0, 120 - Math.round(ctx.durationSeconds / 60))}m from ${ctx.nextCandidateCount} candidates`,
        "Higher energy — shift curve target upward, filter for energy above midpoint",
        "Lower warning count — regenerate with stricter BPM/key scoring",
        "Darker late-night arc — lower energy, later energy peak, keys in compatible minor lane",
        "Warmer daytime arc — brighter energy, earlier peak, more dynamic BPM movement",
      ],
    },
    {
      heading: "How to create it",
      body: "Use Options → Generate to find a new path, then compare options side by side before accepting.",
      bullets: [
        "Current accepted option is preserved until you explicitly accept a new one",
        "Duplicate this playlist first if you want to keep the current version",
        `${ctx.nextCandidateCount} candidates available in the current crate`,
      ],
    },
  ];
  return {
    draftId: newId(),
    type: "alternate_version",
    createdAt: now(),
    title: "Alternate Version Brief",
    summary: `Alternate version directions for "${ctx.playlistTitle}".`,
    sections,
  };
}

export function buildExportCopyDraft(ctx: PlaylistAssistantContext): PlaylistAssistantDraft {
  const intro = `${ctx.playlistTitle} — ${ctx.trackCount} tracks / ${ctx.durationDisplay}`;
  const ytDesc = `${intro}\n\nBPM: ${ctx.bpmRange} · Keys: ${ctx.keySummary} · Energy: ${ctx.energyRange}\n\n${ctx.crateNames.length > 0 ? `Crates: ${ctx.crateNames.join(", ")}\n\n` : ""}Timestamp chapters — not included (enable in Export settings).\n\n#music #playlist`;
  const social = `Now playing: ${ctx.playlistTitle}. ${ctx.trackCount} tracks, ${ctx.durationDisplay}. ${ctx.bpmRange !== "—" ? `BPM ${ctx.bpmRange}.` : ""} ${ctx.keySummary !== "—" ? `Keys: ${ctx.keySummary}.` : ""}`.trim();
  const broadcastTitle = `${ctx.playlistTitle} — ${ctx.durationDisplay} ${ctx.crateNames.length > 0 ? `· ${ctx.crateNames[0]}` : ""}`.trim();

  const sections: PlaylistAssistantDraftSection[] = [
    { heading: "Tracklist intro", body: intro },
    { heading: "YouTube description draft", body: ytDesc },
    { heading: "Social caption draft", body: social },
    { heading: "Broadcast title idea", body: broadcastTitle },
    { heading: "Note", body: "Timestamp chapters are not included. Use M3U export (Settings menu) for the full tracklist with timestamps." },
  ];
  return {
    draftId: newId(),
    type: "export_copy",
    createdAt: now(),
    title: "Export Copy",
    summary: `Copy buckets for "${ctx.playlistTitle}".`,
    sections,
  };
}

export function buildCustomPromptDraft(prompt: string, ctx: PlaylistAssistantContext): PlaylistAssistantDraft {
  const contextBlock = [
    `Playlist: ${ctx.playlistTitle}`,
    `Tracks: ${ctx.trackCount} · ${ctx.durationDisplay}`,
    `BPM: ${ctx.bpmRange}`,
    `Keys: ${ctx.keySummary}`,
    `Energy: ${ctx.energyRange}`,
    ctx.warningCount > 0 ? `Warnings: ${ctx.warningCount}` : null,
    ctx.nextCandidateCount > 0 ? `Candidates: ${ctx.nextCandidateCount}` : null,
    ctx.crateNames.length > 0 ? `Crates: ${ctx.crateNames.join(", ")}` : null,
    ctx.notes ? `Notes: ${ctx.notes.slice(0, 100)}${ctx.notes.length > 100 ? "…" : ""}` : null,
  ].filter(Boolean).join("\n");

  const sections: PlaylistAssistantDraftSection[] = [
    { heading: "Your request", body: `"${prompt}"` },
    { heading: "Playlist context", body: contextBlock },
    {
      heading: "Draft mode",
      body: "Draft mode creates local planning text. AI execution can be wired later.",
      bullets: [
        "Copy this draft and paste it into Claude, ChatGPT, or another assistant",
        "The context block above gives the assistant full playlist awareness",
        "Any suggestions should be applied manually — nothing is changed automatically",
      ],
    },
  ];
  return {
    draftId: newId(),
    type: "custom_prompt",
    createdAt: now(),
    title: "Custom Draft",
    summary: prompt.length > 80 ? prompt.slice(0, 80) + "…" : prompt,
    sections,
  };
}

export function formatDraftForClipboard(draft: PlaylistAssistantDraft): string {
  const lines: string[] = [`## ${draft.title}`, `${draft.summary}`, ""];
  for (const sec of draft.sections) {
    lines.push(`### ${sec.heading}`);
    if (sec.body) lines.push(sec.body);
    if (sec.bullets?.length) {
      for (const b of sec.bullets) lines.push(`- ${b}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function formatDraftForNotes(draft: PlaylistAssistantDraft, date: string): string {
  return `\n\n## Assistant Draft — ${draft.title} — ${date}\n${formatDraftForClipboard(draft)}`;
}
