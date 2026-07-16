import { useState, useEffect, useMemo } from "react";
import type { ArtistProfile } from "../data/artistProfileTypes";
import type { ArtistLibraryViewModel } from "../logic/libraryIntelligenceService";
import { buildArtistLibraryViewModel } from "../logic/libraryIntelligenceService";
import type { Track } from "../data/trackTypes";
import type { ExternalTrackRecord } from "../data/externalTrackTypes";
import {
  getVisibleArtistLinks,
  buildArtistNetworkPreview,
  type ArtistNetworkPreview,
  type ArtistNetworkGroup,
} from "../logic/artistLinkUtils";

// --- List entry types ---

type ProfiledEntry = {
  kind: "profiled";
  artist: ArtistProfile;
  extTrackCount: number;
};

type MissingEntry = {
  kind: "missing";
  displayName: string;
  extTrackCount: number;
};

type ArtistListEntry = ProfiledEntry | MissingEntry;

export type SortMode = "az" | "rating" | "ext" | "missing";
type FilterMode = "all" | "profiled" | "missing" | "linked" | "unlinked";

// --- Avatar helpers ---

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

type Props = {
  libraryTracks: Track[];
};

export function ArtistLibraryPanel({ libraryTracks }: Props) {
  const [vm, setVm] = useState<ArtistLibraryViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("az");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  useEffect(() => {
    setLoading(true);
    buildArtistLibraryViewModel(libraryTracks)
      .then(setVm)
      .finally(() => setLoading(false));
  }, [libraryTracks]);

  // Build combined list entries (profiled + missing-profile ghost entries)
  const allEntries = useMemo<ArtistListEntry[]>(() => {
    if (!vm) return [];

    const profiled: ArtistListEntry[] = vm.artists.map((a) => ({
      kind: "profiled",
      artist: a,
      extTrackCount: a.linkedExternalTrackIds.length,
    }));

    // Collect artist names from unlinked external tracks
    const unlinkedTracks = vm.externalTracks.filter(
      (t) => !t.linkedArtistProfileIds?.length,
    );
    const missingMap = new Map<string, string[]>();
    for (const t of unlinkedTracks) {
      const name = (t.artist as string | undefined)?.trim();
      if (!name) continue;
      if (!missingMap.has(name)) missingMap.set(name, []);
      missingMap.get(name)!.push(t.trackId);
    }
    const missing: ArtistListEntry[] = Array.from(missingMap.entries()).map(
      ([displayName, ids]) => ({ kind: "missing", displayName, extTrackCount: ids.length }),
    );

    return [...profiled, ...missing];
  }, [vm]);

  const visibleEntries = useMemo<ArtistListEntry[]>(() => {
    let entries = allEntries;

    // Filter
    if (filterMode !== "all") {
      entries = entries.filter((e) => {
        if (filterMode === "profiled") return e.kind === "profiled";
        if (filterMode === "missing") return e.kind === "missing";
        if (filterMode === "linked") return e.extTrackCount > 0;
        if (filterMode === "unlinked") return e.extTrackCount === 0;
        return true;
      });
    }

    // Search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      entries = entries.filter((e) => {
        const name = e.kind === "profiled" ? e.artist.displayName : e.displayName;
        if (name.toLowerCase().includes(q)) return true;
        if (e.kind === "profiled") {
          return e.artist.aliases.some((a) => a.toLowerCase().includes(q));
        }
        return false;
      });
    }

    // Sort
    entries = [...entries].sort((a, b) => {
      const nameA = a.kind === "profiled" ? a.artist.displayName : a.displayName;
      const nameB = b.kind === "profiled" ? b.artist.displayName : b.displayName;

      if (sortMode === "missing") {
        if (a.kind !== b.kind) return a.kind === "missing" ? -1 : 1;
        return nameA.localeCompare(nameB);
      }
      if (sortMode === "rating") {
        const rA = a.kind === "profiled" ? (a.artist.rating ?? -1) : -1;
        const rB = b.kind === "profiled" ? (b.artist.rating ?? -1) : -1;
        if (rA !== rB) return rB - rA;
        return nameA.localeCompare(nameB);
      }
      if (sortMode === "ext") {
        if (a.extTrackCount !== b.extTrackCount) return b.extTrackCount - a.extTrackCount;
        return nameA.localeCompare(nameB);
      }
      return nameA.localeCompare(nameB); // az
    });

    return entries;
  }, [allEntries, filterMode, searchQuery, sortMode]);

  if (loading) {
    return (
      <div className="artist-library-panel alp-loading">
        <div className="alp-spinner">Loading artists…</div>
      </div>
    );
  }

  if (!vm) {
    return (
      <div className="artist-library-panel alp-empty">
        <div className="alp-empty-msg">
          <div className="alp-empty-title">No artist profiles found</div>
          <div className="alp-empty-sub">
            Add <code>.md</code> files to{" "}
            <code>library/music/intelligence/artists/</code>
          </div>
        </div>
      </div>
    );
  }

  const { artists, externalTracks, health } = vm;
  const trackMap = new Map(externalTracks.map((t) => [t.trackId, t]));

  const selectedArtist =
    selectedEntryKey && selectedEntryKey.startsWith("profiled:")
      ? artists.find((a) => a.artistId === selectedEntryKey.slice(9)) ?? null
      : null;

  return (
    <div className="artist-library-panel">
      <div className="alp-health-strip">
        <span className="alp-health-item">
          <span className="alp-health-label">Artists</span>
          <span className="alp-health-value">{health.artistCount}</span>
        </span>
        <span className="alp-health-sep">·</span>
        <span className="alp-health-item">
          <span className="alp-health-label">Linked</span>
          <span className="alp-health-value">{health.linkedArtistCount}</span>
        </span>
        <span className="alp-health-sep">·</span>
        <span className="alp-health-item">
          <span className="alp-health-label">Ext tracks</span>
          <span className="alp-health-value">{health.linkedExternalTrackCount}</span>
        </span>
        {health.externalRecordsWithWarnings > 0 && (
          <>
            <span className="alp-health-sep">·</span>
            <span className="alp-health-item alp-health-warn">
              <span className="alp-health-label">Warnings</span>
              <span className="alp-health-value">{health.externalRecordsWithWarnings}</span>
            </span>
          </>
        )}
      </div>

      <div className="alp-body">
        <div className="alp-list-col">
          {/* Search */}
          <div className="alp-search-row">
            <input
              className="alp-search"
              type="text"
              placeholder="Search artists…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Sort + Filter controls */}
          <div className="alp-controls-row">
            <select
              className="alp-control-select"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
            >
              <option value="az">A–Z</option>
              <option value="rating">Rating</option>
              <option value="ext">Linked EXT</option>
              <option value="missing">Missing first</option>
            </select>
            <select
              className="alp-control-select"
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            >
              <option value="all">All</option>
              <option value="profiled">Profiled</option>
              <option value="missing">Missing</option>
              <option value="linked">Linked EXT</option>
              <option value="unlinked">Unlinked</option>
            </select>
          </div>

          {/* Artist list */}
          <div className="alp-artist-list">
            {visibleEntries.map((entry) => {
              const key =
                entry.kind === "profiled"
                  ? `profiled:${entry.artist.artistId}`
                  : `missing:${entry.displayName}`;
              const displayName =
                entry.kind === "profiled" ? entry.artist.displayName : entry.displayName;
              const isActive = selectedEntryKey === key;

              const profileImage = entry.kind === "profiled" ? entry.artist.profileImage : undefined;
              return (
                <ArtistListRow
                  key={key}
                  entry={entry}
                  displayName={displayName}
                  isActive={isActive}
                  sortMode={sortMode}
                  profileImage={profileImage}
                  onClick={() => setSelectedEntryKey((prev) => (prev === key ? null : key))}
                />
              );
            })}
          </div>
        </div>

        <div className="alp-detail-col">
          {selectedArtist ? (
            <ArtistDetail artist={selectedArtist} trackMap={trackMap} />
          ) : (
            <div className="alp-detail-empty">Select an artist to view profile</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ArtistListRow({
  entry,
  displayName,
  isActive,
  sortMode,
  profileImage,
  onClick,
}: {
  entry: ArtistListEntry;
  displayName: string;
  isActive: boolean;
  sortMode: SortMode;
  profileImage?: string;
  onClick: () => void;
}) {
  const initials = getInitials(displayName);
  const isMissing = entry.kind === "missing";
  const rating = entry.kind === "profiled" ? entry.artist.rating : undefined;
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = profileImage && !imgFailed;

  const ratingAccent = isActive || sortMode === "rating";

  return (
    <button
      className={`alp-artist-row${isActive ? " alp-artist-row--active" : ""}${isMissing ? " alp-artist-row--missing" : ""}`}
      onClick={onClick}
    >
      <div className="alp-row-avatar-wrap">
        <div className={`alp-avatar${isMissing ? " alp-avatar--missing" : ""}${isActive ? " alp-avatar--active" : ""}${showImage ? " alp-avatar--image" : ""}`}>
          {showImage ? (
            <img
              src={profileImage}
              alt={displayName}
              className="alp-avatar-img"
              onError={() => setImgFailed(true)}
            />
          ) : initials}
        </div>
      </div>
      <div className="alp-row-body">
        <div className="alp-row-name-line">
          <span className="alp-artist-name">{displayName}</span>
          {rating != null ? (
            <span className={`alp-artist-rating${ratingAccent ? " alp-artist-rating--accent" : ""}`}>
              {rating.toFixed(1)}
            </span>
          ) : (
            <span className="alp-artist-rating alp-artist-rating--missing">—</span>
          )}
        </div>
      </div>
    </button>
  );
}

// --- Sub-components ---

function ArtistDetail({
  artist,
  trackMap,
}: {
  artist: ArtistProfile;
  trackMap: Map<string, ExternalTrackRecord>;
}) {
  const linkedTracks = artist.linkedExternalTrackIds
    .map((id) => trackMap.get(id))
    .filter(Boolean) as ExternalTrackRecord[];

  const networkPreview = buildArtistNetworkPreview(artist, linkedTracks);

  return (
    <div className="alp-detail">
      <div className="alp-detail-header">
        <div className="alp-detail-name">{artist.displayName}</div>
        {artist.rating != null && (
          <div className="alp-detail-rating">{artist.rating.toFixed(1)}</div>
        )}
      </div>

      {artist.catalogStatus && (
        <div className="alp-detail-status">{artist.catalogStatus}</div>
      )}

      <ArtistStatsStrip artist={artist} linkedTrackCount={linkedTracks.length} />

      <ArtistProfileSummary artist={artist} />

      {artist.aliases.length > 0 && (
        <div className="alp-detail-row">
          <span className="alp-detail-label">Aliases</span>
          <span className="alp-detail-value">{artist.aliases.join(", ")}</span>
        </div>
      )}

      {(artist.origin || artist.city || artist.country) && (
        <div className="alp-detail-row">
          <span className="alp-detail-label">Origin</span>
          <span className="alp-detail-value">
            {[artist.city, artist.country].filter(Boolean).join(", ") || artist.origin}
          </span>
        </div>
      )}

      {artist.activeYears && (
        <div className="alp-detail-row">
          <span className="alp-detail-label">Active</span>
          <span className="alp-detail-value">{artist.activeYears}</span>
        </div>
      )}

      {artist.labels.length > 0 && (
        <div className="alp-detail-row">
          <span className="alp-detail-label">Labels</span>
          <span className="alp-detail-value">{artist.labels.join(", ")}</span>
        </div>
      )}

      <ArtistLinkIconRow links={artist.links} />

      {artist.primaryGenres.length > 0 && (
        <div className="alp-detail-section">
          <div className="alp-detail-section-label">Primary Genres</div>
          <div className="alp-tag-group">
            {artist.primaryGenres.map((g) => (
              <span key={g} className="alp-tag alp-tag-genre">{g}</span>
            ))}
          </div>
        </div>
      )}

      {artist.secondaryGenres.length > 0 && (
        <div className="alp-detail-section">
          <div className="alp-detail-section-label">Secondary Genres</div>
          <div className="alp-tag-group">
            {artist.secondaryGenres.map((g) => (
              <span key={g} className="alp-tag alp-tag-genre alp-tag-genre--secondary">{g}</span>
            ))}
          </div>
        </div>
      )}

      {artist.moodTags.length > 0 && (
        <div className="alp-detail-section">
          <div className="alp-detail-section-label">Mood Tags</div>
          <div className="alp-tag-group">
            {artist.moodTags.map((m) => (
              <span key={m} className="alp-tag alp-tag-mood">{m}</span>
            ))}
          </div>
        </div>
      )}

      {artist.mechanisms.length > 0 && (
        <div className="alp-detail-section">
          <div className="alp-detail-section-label">Mechanisms</div>
          <div className="alp-tag-group">
            {artist.mechanisms.map((m) => (
              <span key={m} className="alp-tag alp-tag-mech">{m}</span>
            ))}
          </div>
        </div>
      )}

      {artist.playlistRoles.length > 0 && (
        <div className="alp-detail-section">
          <div className="alp-detail-section-label">Playlist Roles</div>
          <div className="alp-tag-group">
            {artist.playlistRoles.map((r) => (
              <span key={r} className="alp-tag alp-tag-role">{r}</span>
            ))}
          </div>
        </div>
      )}

      <ArtistNetworkPreviewPanel preview={networkPreview} />

      {linkedTracks.length > 0 && (
        <div className="alp-detail-section">
          <div className="alp-detail-section-label">
            Linked External Tracks ({linkedTracks.length})
          </div>
          <div className="alp-linked-tracks">
            {linkedTracks.map((t) => (
              <div key={t.trackId} className="alp-linked-track">
                <div className="alp-linked-track-title">{t.title}</div>
                <div className="alp-linked-track-meta">
                  {t.trackNumber != null && (
                    <span className="alp-linked-track-num">#{t.trackNumber}</span>
                  )}
                  {t.identityStatus && (
                    <span className={`alp-linked-track-status alp-id-status--${t.identityStatus}`}>
                      {t.identityStatus}
                    </span>
                  )}
                  {t.identityConfidence != null && (
                    <span className="alp-linked-track-conf">
                      {Math.round((t.identityConfidence as number) * 100)}%
                    </span>
                  )}
                </div>
                {t.filePath && (
                  <div className="alp-linked-track-path">
                    {(t.filePath as string).split(/[\\/]/).slice(-2).join("/")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {artist.parseWarnings.length > 0 && (
        <div className="alp-detail-section alp-detail-section--warn">
          <div className="alp-detail-section-label">Parse Warnings</div>
          {artist.parseWarnings.map((w, i) => (
            <div key={i} className="alp-warn-item">{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistStatsStrip({
  artist,
  linkedTrackCount,
}: {
  artist: ArtistProfile;
  linkedTrackCount: number;
}) {
  const allGenres = [...artist.primaryGenres, ...artist.secondaryGenres];
  const linkCount = Object.values(artist.links).filter(
    (v) => v && (typeof v === "string" ? v.trim() : (v as string[]).length > 0),
  ).length;

  const items: Array<{ value: number; label: string }> = [
    { value: linkedTrackCount, label: "Ext" },
    { value: allGenres.length, label: "Genres" },
    { value: artist.mechanisms.length, label: "Mech" },
    { value: artist.playlistRoles.length, label: "Roles" },
    { value: linkCount, label: "Links" },
  ].filter((i) => i.value > 0);

  if (items.length === 0) return null;

  return (
    <div className="alp-stats-strip">
      {items.map((item, idx) => (
        <span key={item.label}>
          {idx > 0 && <span className="alp-stats-sep">·</span>}
          <span className="alp-stats-value">{item.value}</span>
          <span className="alp-stats-label"> {item.label}</span>
        </span>
      ))}
    </div>
  );
}

function ArtistProfileSummary({ artist }: { artist: ArtistProfile }) {
  let summary = artist.profileSummary;

  if (!summary) {
    const genrePart = artist.primaryGenres.length > 0
      ? artist.primaryGenres.slice(0, 2).join(" / ")
      : "";
    const moodPart = artist.moodTags.length > 0
      ? `, associated with ${artist.moodTags.slice(0, 3).join(", ")}`
      : "";
    const originPart = artist.origin ? ` from ${artist.origin}` : "";
    if (genrePart) {
      summary = `${artist.displayName} is a ${genrePart} artist${moodPart}${originPart}.`;
    }
  }

  if (!summary) return null;

  return <div className="alp-profile-summary">{summary}</div>;
}

function ArtistLinkIconRow({ links }: { links: ArtistProfile["links"] }) {
  const visibleLinks = getVisibleArtistLinks(links);
  if (visibleLinks.length === 0) return null;

  return (
    <div className="alp-link-icon-row">
      {visibleLinks.map(({ key, url, label, icon }) => (
        <a
          key={key}
          className="alp-link-icon-btn"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={label}
        >
          <svg
            className="alp-link-icon-svg"
            viewBox={icon.viewBox}
            xmlns="http://www.w3.org/2000/svg"
            aria-label={label}
            dangerouslySetInnerHTML={{ __html: icon.inner }}
          />
        </a>
      ))}
    </div>
  );
}

const GROUP_TYPE_CLASS: Record<ArtistNetworkGroup["type"], string> = {
  artist: "anp-group--artist",
  track: "anp-group--track",
  genre: "anp-group--genre",
  mood: "anp-group--mood",
  mechanism: "anp-group--mech",
  label: "anp-group--label",
  role: "anp-group--role",
};

function ArtistNetworkPreviewPanel({ preview }: { preview: ArtistNetworkPreview }) {
  const { groups, stats } = preview;
  const totalNodes = Object.values(stats).reduce((sum, n) => sum + n, 0);
  if (totalNodes === 0) return null;

  return (
    <div className="alp-detail-section alp-network-preview">
      <div className="alp-detail-section-label">Network Preview</div>
      <div className="anp-artist-root">
        <span className="anp-root-label">{preview.artistName}</span>
      </div>
      <div className="anp-groups">
        {groups.map((group) => (
          <div key={group.type} className={`anp-group ${GROUP_TYPE_CLASS[group.type] ?? ""}`}>
            <div className="anp-group-label">{group.label}</div>
            <div className="anp-group-items">
              {group.items.slice(0, 8).map((item) => (
                <span key={item} className="anp-item">{item}</span>
              ))}
              {group.items.length > 8 && (
                <span className="anp-item anp-item--more">+{group.items.length - 8}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
