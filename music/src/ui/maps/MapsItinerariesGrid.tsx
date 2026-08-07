import { useEffect, useState } from "react";
import * as itineraryStore from "../../maps/itineraryStore";
import type { Itinerary } from "../../data/itineraryTypes";
import { CollectionGrid } from "../CollectionGrid";
import { CollectionCard } from "../CollectionCard";
import { Icon } from "../Icon";
import { ItineraryRunControls } from "./ItineraryRunControls";

// 0729E_MAPS_Itinerary_Collections_Foundation — modeled directly on
// PlaylistsGrid.tsx's use of CollectionGrid/CollectionCard (title, stop
// count, updated timestamp, + New Itinerary) — not the heavier Geographic
// Grid|Rows dual-view, which is overkill for a "one real itinerary" build.
// Creating an itinerary opens its editor immediately (MAPS → Itineraries →
// New Itinerary → editor).

type Props = {
  onOpen: (id: string) => void;
};

function relTimeShort(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ArtBlock({ itinerary }: { itinerary: Itinerary }) {
  const initials = itinerary.title.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <div className="pgc-art" style={{ background: "var(--surface3)" }}>
      {initials ? <span className="pgc-art-initials">{initials}</span> : <Icon name="route" />}
    </div>
  );
}

export function MapsItinerariesGrid({ onOpen }: Props) {
  const [itineraries, setItineraries] = useState<Itinerary[]>(itineraryStore.listItineraries);

  useEffect(() => {
    return itineraryStore.subscribe(() => setItineraries(itineraryStore.listItineraries()));
  }, []);

  async function handleCreate() {
    const itinerary = await itineraryStore.createItinerary("New Itinerary");
    onOpen(itinerary.id);
  }

  async function handleDuplicate(id: string) {
    const source = itineraryStore.getItinerary(id);
    if (!source) return;
    const copy = await itineraryStore.createItinerary(`${source.title} Copy`);
    await itineraryStore.updateItinerary(copy.id, (it) => ({
      ...it,
      stops: source.stops,
      stages: source.stages,
      routeSets: source.routeSets,
    }));
    onOpen(copy.id);
  }

  async function handleDelete(id: string) {
    await itineraryStore.deleteItinerary(id);
  }

  return (
    <CollectionGrid
      items={itineraries}
      itemId={(it) => it.id}
      title="Itineraries"
      createLabel="+ New Itinerary"
      onCreate={handleCreate}
      emptyMessage="No itineraries yet."
      onDelete={handleDelete}
      onDuplicate={handleDuplicate}
      deleteModalTitle="Delete Itinerary?"
      deleteModalBody={(it) => `"${it.title}" will be removed.`}
      deleteActionLabel="Delete Itinerary"
      renderCtxMenu={(id, { onDuplicate, startDelete, close }) => (
        <>
          <button className="ctx-item" onClick={() => { onOpen(id); close(); }}>Open</button>
          {onDuplicate && <button className="ctx-item" onClick={() => onDuplicate(id)}>Duplicate</button>}
          <div className="ctx-sep" />
          <button className="ctx-item danger" onClick={() => startDelete(id)}>Delete…</button>
        </>
      )}
      renderCard={(itinerary, { openCtxMenu }) => (
        <CollectionCard
          key={itinerary.id}
          id={itinerary.id}
          title={itinerary.title}
          artSlot={<ArtBlock itinerary={itinerary} />}
          badge={itinerary.stops.length}
          timestampSlot={itinerary.updatedAt ? <span className="pgc-updated">{relTimeShort(itinerary.updatedAt)}</span> : undefined}
          onClick={() => onOpen(itinerary.id)}
          onContextMenu={(e) => openCtxMenu(e, itinerary.id)}
          hoverActions={
            <>
              <ItineraryRunControls itinerary={itinerary} compact />
              <button className="pgc-ha-btn" title="Open" onClick={() => onOpen(itinerary.id)}>Open</button>
              <button className="pgc-ha-btn" title="More" onClick={(e) => openCtxMenu(e, itinerary.id)}>⋮</button>
            </>
          }
        />
      )}
    />
  );
}
