import type { ArtistProfile } from "../data/artistProfileTypes";
import type { ExternalTrackRecord } from "../data/externalTrackTypes";
import type { ArtistExternalLinkReport } from "./linkArtistProfilesToExternalTracks";
import { loadArtistProfiles } from "../data/loadArtistProfiles";
import { repairExternalTrackRecord } from "./stabilizeExternalTrackRecord";
import { linkArtistProfilesToExternalTracks } from "./linkArtistProfilesToExternalTracks";
import type { Track } from "../data/trackTypes";

export type ArtistHealthReport = {
  artistCount: number;
  externalTrackCount: number;
  linkedArtistCount: number;
  linkedExternalTrackCount: number;
  externalRecordsWithWarnings: number;
  artistsWithValidLinks: number;
  artistsWithBrokenLinks: number;
  artistsWithProfileImage: number;
  artistsMissingProfileImage: number;
  parseWarnings: string[];
  brokenLinkExamples: Array<{ artistId: string; displayName: string; key: string; value: string }>;
};

export type ArtistLibraryViewModel = {
  artists: ArtistProfile[];
  externalTracks: ExternalTrackRecord[];
  linkReport: ArtistExternalLinkReport;
  health: ArtistHealthReport;
};

function extractArtistFromTitle(title: string): string {
  // Handle "NN. Artist - Track Title" pattern common in numbered external tracks
  const numbered = title.match(/^\d+\.\s+(.+?)\s+-\s+.+$/);
  if (numbered) return numbered[1].trim();
  // Handle "Artist - Track Title"
  const dashed = title.match(/^(.+?)\s+-\s+.+$/);
  if (dashed) return dashed[1].trim();
  return "";
}

function trackToExternalRecord(t: Track): ExternalTrackRecord {
  const rawArtist = t.artist ?? "";
  const artist = rawArtist.trim() || extractArtistFromTitle(t.title ?? "");
  return {
    trackId: t.trackId,
    title: t.title ?? "",
    artist,
    filePath: t.filePath,
    filename: t.filePath?.split(/[\\/]/).pop(),
    sourceZone: "external",
    sourceLibrary: "External",
    album: t.albumTitle,
    year: t.year,
    trackNumber: t.trackNumber,
    durationSeconds: t.durationSeconds,
    bpm: t.bpm,
    camelotKey: t.camelotKey,
    musicalKey: t.musicalKey,
    genre: t.genre,
    moodTags: t.moodTags,
    identityStatus: t.identityStatus,
    identityConfidence: t.identityConfidence,
    identitySource: t.identitySource,
  };
}

export async function buildArtistLibraryViewModel(
  libraryTracks: Track[],
): Promise<ArtistLibraryViewModel> {
  const externalLibraryTracks = libraryTracks.filter((t) => t.sourceOwner === "external");

  const rawExternalRecords = externalLibraryTracks.map(trackToExternalRecord);
  const repairedRecords = rawExternalRecords.map(repairExternalTrackRecord);

  const [artistProfiles] = await Promise.all([loadArtistProfiles()]);

  const { artists, externalTracks, report } = linkArtistProfilesToExternalTracks(
    artistProfiles,
    repairedRecords,
  );

  const parseWarnings = artists.flatMap((a) => a.parseWarnings);
  const externalRecordsWithWarnings = repairedRecords.filter(
    (r) => (r.repairWarnings?.length ?? 0) > 0,
  ).length;

  // Link health
  const brokenLinkExamples: ArtistHealthReport["brokenLinkExamples"] = [];
  let artistsWithValidLinks = 0;
  let artistsWithBrokenLinks = 0;
  let artistsWithProfileImage = 0;

  for (const a of artists) {
    const linkValues = Object.entries(a.links);
    const validLinks = linkValues.filter(([, v]) => typeof v === "string" && (v as string).startsWith("http"));
    const brokenLinks = linkValues.filter(([, v]) => {
      if (typeof v !== "string" || !(v as string).trim()) return false;
      const s = v as string;
      return !s.startsWith("http://") && !s.startsWith("https://");
    });

    if (validLinks.length > 0) artistsWithValidLinks++;
    if (brokenLinks.length > 0) {
      artistsWithBrokenLinks++;
      for (const [key, val] of brokenLinks.slice(0, 2)) {
        brokenLinkExamples.push({ artistId: a.artistId, displayName: a.displayName, key, value: String(val).slice(0, 80) });
      }
    }
    if (a.profileImage) artistsWithProfileImage++;
  }

  return {
    artists,
    externalTracks,
    linkReport: report,
    health: {
      artistCount: artists.length,
      externalTrackCount: externalTracks.length,
      linkedArtistCount: report.linkedArtistCount,
      linkedExternalTrackCount: report.linkedTrackCount,
      externalRecordsWithWarnings,
      artistsWithValidLinks,
      artistsWithBrokenLinks,
      artistsWithProfileImage,
      artistsMissingProfileImage: artists.length - artistsWithProfileImage,
      parseWarnings,
      brokenLinkExamples,
    },
  };
}
