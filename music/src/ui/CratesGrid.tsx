import { useState, useMemo } from "react";
import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import { resolveCrateTracks } from "../logic/resolveCrate";
import { CollectionGrid } from "./CollectionGrid";
import { CollectionCard } from "./CollectionCard";
import { relTimeShort } from "../logic/dateFormat";
import { SourceBadge } from "./SourceBadge";
import { CrateIcon } from "./CrateIcon";
import { CrateMoodPicker } from "./CrateMoodPicker";
import { getCrateVisualToken } from "../logic/crateMoodSummary";
import type { MoodGroupId } from "../logic/moodTaxonomy";

type Props = {
  crates: CrateRecord[];
  libraryTracks: Track[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: (name?: string) => void;
  onGenerateMoodCrates?: () => { created: number; skipped: number; empty: number };
};

/** Returns a compact filter summary, omitting mood tags that duplicate the crate name. */
function filterSummary(crate: CrateRecord): string {
  const parts: string[] = [];
  // Skip mood tags that just repeat the crate name (e.g. "Chill" crate with moodTags:["Chill"])
  const nonRedundantMoods = crate.filters.moodTags.filter(
    (m) => m.toLowerCase() !== crate.name.toLowerCase(),
  );
  if (nonRedundantMoods.length) {
    parts.push(nonRedundantMoods.slice(0, 2).join(" · ") + (nonRedundantMoods.length > 2 ? " +more" : ""));
  }
  if (crate.filters.groupings.length) parts.push(crate.filters.groupings.slice(0, 2).join(", "));
  if (crate.filters.genres.length) parts.push(crate.filters.genres.slice(0, 2).join(", "));
  if (crate.filters.search) parts.push(`"${crate.filters.search}"`);
  return parts.join(" · ");
}

export function CratesGrid({ crates, libraryTracks, onOpen, onDelete, onCreate, onGenerateMoodCrates }: Props) {
  const [moodFilter, setMoodFilter] = useState<MoodGroupId | "all">("all");
  const [toast, setToast] = useState<string | null>(null);

  function handleGenerate() {
    if (!onGenerateMoodCrates) return;
    const { created, skipped, empty } = onGenerateMoodCrates();
    const msg = `Generated ${created} mood crate${created !== 1 ? "s" : ""} · skipped ${skipped} existing · ${empty} empty`;
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // Precompute visual tokens for all crates
  const visualTokens = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getCrateVisualToken>>();
    for (const crate of crates) {
      const { tracks } = resolveCrateTracks(crate, libraryTracks);
      map.set(crate.id, getCrateVisualToken(crate, tracks));
    }
    return map;
  }, [crates, libraryTracks]);

  // Counts per mood group (crates whose dominant group matches)
  const moodCounts = useMemo(() => {
    const counts: Partial<Record<MoodGroupId, number>> = {};
    for (const [, vt] of visualTokens) {
      if (vt.dominantMoodGroup) {
        counts[vt.dominantMoodGroup] = (counts[vt.dominantMoodGroup] ?? 0) + 1;
      }
    }
    return counts;
  }, [visualTokens]);

  return (
    <CollectionGrid
      items={crates}
      itemId={(c) => c.id}
      title="Crates"
      createLabel="+ New Crate"
      createWithNamePrompt
      createNamePlaceholder="Crate name…"
      defaultCreateName="New Crate"
      onCreate={onCreate}
      emptyMessage="No crates yet — create one to build a reusable track pool."
      onDelete={onDelete}
      deleteModalTitle="Delete Crate?"
      deleteModalBody={(c) => `"${c.name}" will be removed. Library tracks are not deleted.`}
      deleteActionLabel="Delete Crate"
      headerSlot={
        <>
          <CrateMoodPicker
            activeGroup={moodFilter}
            onChange={setMoodFilter}
            counts={moodCounts}
          />
          {onGenerateMoodCrates && (
            <div className="cg-action-row">
              <button className="cg-generate-btn" onClick={handleGenerate}>
                Generate Mood Crates
              </button>
              {toast && <span className="cg-toast">{toast}</span>}
            </div>
          )}
        </>
      }
      renderCtxMenu={(id, { startDelete, close }) => (
        <>
          <button className="ctx-item" onClick={() => { onOpen(id); close(); }}>Open Crate</button>
          <div className="ctx-sep" />
          <button className="ctx-item danger" onClick={() => startDelete(id)}>Delete…</button>
        </>
      )}
      renderCard={(crate, { openCtxMenu }) => {
        const { tracks } = resolveCrateTracks(crate, libraryTracks);
        const vt = visualTokens.get(crate.id)!;
        const hasCat = crate.sourceOwners.includes("studiorich");
        const hasExt = crate.sourceOwners.includes("external");
        const isMixed = hasCat && hasExt;

        // Mood swatch = card has a dominant mood group
        const isMoodSwatch = !!vt.dominantMoodGroup;

        // Dim when mood filter active and this crate doesn't match
        const filterDim = moodFilter !== "all" && vt.dominantMoodGroup !== moodFilter;

        const accentStyle = vt.dominantMoodGroup
          ? { "--crate-accent": `var(${vt.colorToken})` } as React.CSSProperties
          : undefined;

        const moodFilterText = filterSummary(crate);

        return (
          <CollectionCard
            key={crate.id}
            id={crate.id}
            title={crate.name}
            style={accentStyle}
            artSlot={
              <div className={`pgc-art pgc-art--crate${isMoodSwatch ? " pgc-art--mood" : ""}`}>
                {!isMoodSwatch && (
                  <CrateIcon type={vt.type} moodGroup={undefined} iconKey={vt.iconKey} />
                )}
              </div>
            }
            badge={tracks.length}
            metaSlot={isMoodSwatch ? (
              // Mood swatch: only show EXT or mixed source badge; no duration, no count text
              (hasExt || isMixed) ? (
                <div className="pgc-crate-meta">
                  <div className="pgc-badges-row">
                    {isMixed
                      ? <><SourceBadge source="CAT" className="pgc-source-badge" /><SourceBadge source="EXT" className="pgc-source-badge" /></>
                      : <SourceBadge source="EXT" className="pgc-source-badge" />}
                  </div>
                  {moodFilterText && <div className="pgc-crate-filters">{moodFilterText}</div>}
                </div>
              ) : (
                moodFilterText
                  ? <div className="pgc-crate-meta"><div className="pgc-crate-filters">{moodFilterText}</div></div>
                  : null
              )
            ) : (
              // Utility card: show source badges + filter summary (no duration)
              <div className="pgc-crate-meta">
                <div className="pgc-badges-row">
                  {isMixed
                    ? <><SourceBadge source="CAT" className="pgc-source-badge" /><SourceBadge source="EXT" className="pgc-source-badge" /></>
                    : hasExt
                      ? <SourceBadge source="EXT" className="pgc-source-badge" />
                      : null}
                  <span className="pgc-meta-text">{tracks.length} tracks</span>
                </div>
                {moodFilterText && <div className="pgc-crate-filters">{moodFilterText}</div>}
              </div>
            )}
            timestampSlot={isMoodSwatch ? undefined : <span className="pgc-updated">{relTimeShort(crate.updatedAt)}</span>}
            activeClass={[
              "pgc--crate",
              isMoodSwatch ? "pgc--mood-swatch" : "",
              filterDim ? "pgc--dim" : "",
              vt.dominantMoodGroup ? `pgc--mood-${vt.dominantMoodGroup}` : "",
            ].filter(Boolean).join(" ")}
            onClick={() => onOpen(crate.id)}
            onContextMenu={(e) => openCtxMenu(e, crate.id)}
            hoverActions={
              <>
                <button className="pgc-ha-btn" onClick={() => onOpen(crate.id)}>Open</button>
                <button className="pgc-ha-btn" onClick={(e) => openCtxMenu(e, crate.id)}>⋮</button>
              </>
            }
          />
        );
      }}
    />
  );
}
