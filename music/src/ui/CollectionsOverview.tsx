// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §9 — a small,
// deliberately minimal overview page for the newly-clickable "Collections"
// sidebar header: three summary tiles linking to the existing grid views
// via the same handlers the sidebar rows already use. No new functionality
// invented beyond linking to what already exists.

interface Props {
  crateCount: number;
  playlistCount: number;
  bankCount: number;
  onViewCrates: () => void;
  onViewPlaylists: () => void;
  onViewBanks: () => void;
}

export function CollectionsOverview({ crateCount, playlistCount, bankCount, onViewCrates, onViewPlaylists, onViewBanks }: Props) {
  return (
    <div className="collections-overview">
      <h2>Collections</h2>
      <div className="collections-overview-tiles">
        <button className="radio-stat-tile radio-stat-tile--clickable" onClick={onViewCrates}>
          <span className="radio-stat-value">{crateCount}</span>
          <span className="radio-stat-label">Crates</span>
        </button>
        <button className="radio-stat-tile radio-stat-tile--clickable" onClick={onViewPlaylists}>
          <span className="radio-stat-value">{playlistCount}</span>
          <span className="radio-stat-label">Playlists</span>
        </button>
        <button className="radio-stat-tile radio-stat-tile--clickable" onClick={onViewBanks}>
          <span className="radio-stat-value">{bankCount}</span>
          <span className="radio-stat-label">Banks</span>
        </button>
      </div>
    </div>
  );
}
