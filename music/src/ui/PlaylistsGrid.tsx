import { useState } from "react";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";
import { relTimeShort } from "../logic/dateFormat";
import { CollectionGrid } from "./CollectionGrid";
import { CollectionCard } from "./CollectionCard";
import { getSourceComposition, SourceCompositionBadges } from "./SourceBadge";

type Props = {
  playlists: PlaylistRecord[];
  libraryTracks: Track[];
  activePlaylistId: string;
  onOpen: (id: string) => void;
  onPlay: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §3 — explicit
  // send affordance, MUSIC-side; never auto-publishes.
  onSendToRadio: (id: string) => void;
};

function fmtDurShort(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

function CoverBlock({ playlist }: { playlist: PlaylistRecord }) {
  const [err, setErr] = useState(false);
  const src = playlist.coverImage?.src;
  const accent = playlist.accentColor ?? "var(--surface3)";
  const initials = playlist.title.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  if (src && !err) {
    return (
      <div className="pgc-art" style={{ background: accent }}>
        <img src={src} alt={playlist.title} className="pgc-art-img" onError={() => setErr(true)} />
      </div>
    );
  }
  return (
    <div className="pgc-art" style={{ background: accent }}>
      <span className="pgc-art-initials">{initials || "♫"}</span>
    </div>
  );
}

export function PlaylistsGrid({ playlists, libraryTracks, activePlaylistId, onOpen, onPlay, onDuplicate, onDelete, onCreate, onSendToRadio }: Props) {
  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));

  function cardStats(pl: PlaylistRecord) {
    const filled = pl.slots.filter((s) => s.assignedTrackId);
    const totalSecs = filled.reduce((sum, s) => {
      const t = s.assignedTrackId ? tracksById.get(s.assignedTrackId) : undefined;
      return sum + (t?.durationSeconds ?? 0);
    }, 0);
    return { count: filled.length, totalSecs };
  }

  return (
    <CollectionGrid
      items={playlists}
      itemId={(pl) => pl.playlistId}
      title="Playlists"
      createLabel="+ New Playlist"
      onCreate={onCreate}
      emptyMessage="No playlists yet."
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      deleteModalTitle="Delete Playlist?"
      deleteModalBody={(pl) => `"${pl.title}" will be removed. Library tracks are not deleted.`}
      deleteActionLabel="Delete Playlist"
      minItemsForDelete={2}
      renderCtxMenu={(id, { startDelete, onDuplicate: dup, close }) => (
        <>
          <button className="ctx-item" onClick={() => { onOpen(id); close(); }}>Open</button>
          <button className="ctx-item" onClick={() => { onPlay(id); close(); }}>Play</button>
          <div className="ctx-sep" />
          {dup && <button className="ctx-item" onClick={() => dup(id)}>Duplicate</button>}
          <button className="ctx-item" onClick={() => { onSendToRadio(id); close(); }}>◎ Send → RADIO</button>
          <div className="ctx-sep" />
          <button
            className={`ctx-item danger${playlists.length <= 1 ? " ctx-item-disabled" : ""}`}
            disabled={playlists.length <= 1}
            onClick={() => startDelete(id)}
          >Delete…</button>
        </>
      )}
      renderCard={(pl, { openCtxMenu }) => {
        const { count, totalSecs } = cardStats(pl);
        const isActive = pl.playlistId === activePlaylistId;
        const composition = getSourceComposition(pl.slots.map((s) => s.assignedTrackId), libraryTracks);
        return (
          <CollectionCard
            key={pl.playlistId}
            id={pl.playlistId}
            title={pl.title}
            artSlot={<CoverBlock playlist={pl} />}
            badge={count}
            metaSlot={
              <>
                {totalSecs > 0 && <span className="pgc-dur">{fmtDurShort(totalSecs)}</span>}
                {composition.length > 0 && (
                  <span className="pgc-badges-row">
                    <SourceCompositionBadges composition={composition} className="pgc-source-badge" />
                  </span>
                )}
              </>
            }
            timestampSlot={pl.updatedAt ? <span className="pgc-updated">{relTimeShort(pl.updatedAt)}</span> : undefined}
            activeClass={isActive ? "pgc--active" : undefined}
            onClick={() => onOpen(pl.playlistId)}
            onContextMenu={(e) => openCtxMenu(e, pl.playlistId)}
            hoverActions={
              <>
                <button className="pgc-ha-btn" title="Play" onClick={() => onPlay(pl.playlistId)}>▶</button>
                <button className="pgc-ha-btn" title="Open" onClick={() => onOpen(pl.playlistId)}>Open</button>
                <button className="pgc-ha-btn" title="More" onClick={(e) => openCtxMenu(e, pl.playlistId)}>⋮</button>
              </>
            }
          />
        );
      }}
    />
  );
}
