import type { ArtistProfile } from "../data/artistProfileTypes";
import type { ExternalTrackRecord } from "../data/externalTrackTypes";
import { normalizeArtistName, splitArtistList } from "./musicIdentityNormalization";

export type ArtistExternalLinkReport = {
  artistProfileCount: number;
  externalTrackCount: number;
  linkedArtistCount: number;
  linkedTrackCount: number;
  unlinkedArtistIds: string[];
  unlinkedExternalTrackIds: string[];
  duplicateArtistMatches: Array<{
    trackId: string;
    artist: string;
    candidateArtistIds: string[];
  }>;
  warnings: string[];
};

type LinkResult = {
  artists: ArtistProfile[];
  externalTracks: ExternalTrackRecord[];
  report: ArtistExternalLinkReport;
};

function normKey(s: string): string {
  return normalizeArtistName(s).normalize("NFC").toLowerCase();
}

function filenameToDisplay(filename: string): string {
  return filename.replace(/\.md$/, "").replace(/_/g, " ");
}

export function linkArtistProfilesToExternalTracks(
  artists: ArtistProfile[],
  externalTracks: ExternalTrackRecord[],
): LinkResult {
  const warnings: string[] = [];

  // Build lookup: normalized name/alias → artist profile
  const nameToArtists = new Map<string, ArtistProfile[]>();
  for (const artist of artists) {
    const keys = new Set<string>();
    keys.add(normKey(artist.displayName));
    if (artist.sortName) keys.add(normKey(artist.sortName));
    for (const alias of artist.aliases) keys.add(normKey(alias));
    // Also match from filename stem
    keys.add(normKey(filenameToDisplay(artist.filename)));

    for (const k of keys) {
      if (!nameToArtists.has(k)) nameToArtists.set(k, []);
      nameToArtists.get(k)!.push(artist);
    }
  }

  const artistLinkedTrackIds = new Map<string, Set<string>>();
  for (const a of artists) artistLinkedTrackIds.set(a.artistId, new Set());

  const updatedTracks: ExternalTrackRecord[] = [];
  const duplicateMatches: ArtistExternalLinkReport["duplicateArtistMatches"] = [];
  const linkedTrackIds = new Set<string>();

  for (const track of externalTracks) {
    const artistField = typeof track.artist === "string" ? track.artist : "";
    const candidates = new Set<ArtistProfile>();

    // Match each member of the artist field
    for (const part of splitArtistList(artistField)) {
      const key = normKey(part);
      const matches = nameToArtists.get(key) ?? [];
      for (const m of matches) candidates.add(m);
    }

    const candidateList = Array.from(candidates);
    const linkedIds = candidateList.map((a) => a.artistId);
    const linkedPaths = candidateList.map((a) => a.sourcePath);

    if (candidateList.length > 1) {
      duplicateMatches.push({
        trackId: track.trackId,
        artist: artistField,
        candidateArtistIds: linkedIds,
      });
    }

    if (candidateList.length > 0) linkedTrackIds.add(track.trackId);
    for (const a of candidateList) artistLinkedTrackIds.get(a.artistId)?.add(track.trackId);

    updatedTracks.push({
      ...track,
      linkedArtistProfileIds: linkedIds.length ? linkedIds : track.linkedArtistProfileIds,
      linkedArtistProfilePaths: linkedPaths.length ? linkedPaths : track.linkedArtistProfilePaths,
    });
  }

  const updatedArtists: ArtistProfile[] = artists.map((a) => ({
    ...a,
    linkedExternalTrackIds: Array.from(artistLinkedTrackIds.get(a.artistId) ?? []),
  }));

  const unlinkedArtistIds = updatedArtists
    .filter((a) => a.linkedExternalTrackIds.length === 0)
    .map((a) => a.artistId);

  const unlinkedExternalTrackIds = externalTracks
    .filter((t) => !linkedTrackIds.has(t.trackId))
    .map((t) => t.trackId);

  const report: ArtistExternalLinkReport = {
    artistProfileCount: artists.length,
    externalTrackCount: externalTracks.length,
    linkedArtistCount: artists.length - unlinkedArtistIds.length,
    linkedTrackCount: linkedTrackIds.size,
    unlinkedArtistIds,
    unlinkedExternalTrackIds,
    duplicateArtistMatches: duplicateMatches,
    warnings,
  };

  return { artists: updatedArtists, externalTracks: updatedTracks, report };
}
