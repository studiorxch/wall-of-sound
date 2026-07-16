import type { ArtistProfile } from "./artistProfileTypes";
import { artistNameToId } from "../logic/musicIdentityNormalization";

declare const __LIBRARY_ROOT__: string;

// ---------------------------------------------------------------------------
// YAML frontmatter parser
// Handles: scalars, lists, nested objects (links, image), folded scalars (>|)
// ---------------------------------------------------------------------------

function parseYamlFrontmatter(md: string): { front: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = [];
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { front: {}, warnings: ["No YAML frontmatter found"] };
  const yaml = match[1];
  const front: Record<string, unknown> = {};

  let currentKey = "";
  let currentParentKey = "";  // set when a bare top-level key opens a nested block
  let currentList: string[] | null = null;
  let inFoldedScalar = false;  // only true after seeing rv === ">" or "|"

  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.trimEnd();

    // --- Folded/literal scalar continuation (ONLY when explicitly in folded mode) ---
    if (inFoldedScalar && /^\s/.test(line)) {
      const existing = (front[currentKey] as string) || "";
      front[currentKey] = existing ? existing + " " + line.trim() : line.trim();
      continue;
    }
    // Any non-indented (or empty) line exits folded scalar mode
    inFoldedScalar = false;

    // Skip blank lines
    if (!line.trim()) continue;

    // --- List item ---
    if (/^\s+-\s/.test(line) && currentKey) {
      const val = line.replace(/^\s+-\s*/, "").trim().replace(/^["']|["']$/g, "");
      if (!currentList) {
        currentList = [];
        front[currentKey] = currentList;
        // Also update the parent object if one is being built
        if (currentParentKey && currentKey !== currentParentKey) {
          (front[currentParentKey] as Record<string, unknown>)[currentKey] = currentList;
        }
      }
      currentList.push(val);
      continue;
    }

    // --- Top-level key: value ---
    const kv = line.match(/^(\w[\w_-]*):\s*(.*)/);
    if (kv) {
      // A new top-level key resets nested context
      currentParentKey = "";
      currentKey = kv[1];
      currentList = null;
      const rv = kv[2].trim();

      if (!rv || rv === "null" || rv === "~") {
        // Bare key — may open a nested block
        front[currentKey] = undefined;
        currentParentKey = currentKey;
        // Pre-initialise as object so nested keys can populate it
        front[currentKey] = {} as Record<string, unknown>;
      } else if (rv === ">" || rv === "|") {
        front[currentKey] = "";
        inFoldedScalar = true;
      } else if (rv === "true")  { front[currentKey] = true; }
      else if (rv === "false") { front[currentKey] = false; }
      else if (rv === "[]")    { front[currentKey] = []; }
      else if (/^\d+(\.\d+)?$/.test(rv)) { front[currentKey] = Number(rv); }
      else { front[currentKey] = rv.replace(/^["']|["']$/g, ""); }
      continue;
    }

    // --- Nested key (2+ spaces indent) ---
    const nested = line.match(/^\s{2,}(\w[\w_-]*):\s*(.*)/);
    if (nested) {
      currentKey = nested[1];
      currentList = null;
      const rv = nested[2].trim();

      let value: unknown;
      if (!rv || rv === "null" || rv === "~") {
        value = undefined;
        // This nested key may itself open a deeper list block
      } else if (rv === ">" || rv === "|") {
        value = "";
        inFoldedScalar = true;
      } else if (rv === "[]") {
        value = [];
      } else {
        value = rv.replace(/^["']|["']$/g, "");
      }

      // Store flat (backward compat — profileFromFrontmatter reads top-level keys)
      if (value !== undefined) front[currentKey] = value;

      // Also store in the parent nested object (e.g. front["links"]["website"])
      if (currentParentKey && front[currentParentKey] && typeof front[currentParentKey] === "object") {
        if (value !== undefined && value !== "") {
          (front[currentParentKey] as Record<string, unknown>)[currentKey] = value;
        }
      }
    }
  }

  return { front, warnings };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function strArr(val: unknown): string[] {
  if (Array.isArray(val)) return (val as unknown[]).filter((v) => typeof v === "string" && (v as string).trim()) as string[];
  if (typeof val === "string" && val.trim()) return [val.trim()];
  return [];
}

function str(val: unknown): string | undefined {
  if (typeof val === "string" && val.trim()) return val.trim();
  return undefined;
}

function filenameToDisplayName(filename: string): string {
  return filename.replace(/\.md$/, "").replace(/_/g, " ");
}

function isValidUrl(v: string): boolean {
  return v.startsWith("http://") || v.startsWith("https://");
}

// ---------------------------------------------------------------------------
// Profile builder
// ---------------------------------------------------------------------------

const KNOWN_LINK_KEYS = [
  "website", "bandcamp", "soundcloud", "instagram", "facebook", "youtube",
  "spotify", "apple_music", "tidal", "twitch", "x", "tiktok",
  "resident_advisor", "discogs", "beatport", "wikipedia",
] as const;

function profileFromFrontmatter(
  front: Record<string, unknown>,
  filename: string,
  sourcePath: string,
  warnings: string[],
): ArtistProfile {
  const displayName =
    str(front["display_name"]) ?? str(front["title"]) ?? filenameToDisplayName(filename);

  const artistId =
    str(front["artist_id"]) ?? `artist_${artistNameToId(displayName)}`;

  // --- Links ---
  // Prefer the nested `links` object; fall back to flat top-level keys for older profiles
  const linksObj = (typeof front["links"] === "object" && front["links"] !== null)
    ? (front["links"] as Record<string, unknown>)
    : front;

  const links: Record<string, string | string[] | undefined> = {};
  for (const k of KNOWN_LINK_KEYS) {
    const v = linksObj[k] ?? front[k];
    if (typeof v === "string" && v.trim() && isValidUrl(v.trim())) {
      links[k] = v.trim();
    }
  }
  const other = strArr((linksObj["other"] ?? front["other"]));
  const validOther = other.filter(isValidUrl);
  if (validOther.length) links["other"] = validOther;

  // --- Profile image ---
  // Resolution order: image.profile_image → profile_image → imagePath
  const imageObj = (typeof front["image"] === "object" && front["image"] !== null)
    ? (front["image"] as Record<string, unknown>)
    : undefined;
  const profileImage =
    str(imageObj?.["profile_image"]) ??
    str(front["profile_image"]) ??
    str(front["imagePath"]);

  return {
    artistId,
    displayName,
    sortName: str(front["sort_name"]),
    filename,
    sourcePath,
    profileImage,
    rating: typeof front["rating"] === "number" ? (front["rating"] as number) : undefined,
    catalogStatus: str(front["catalog_status"]),
    sourceRole: str(front["source_role"]),
    profileSummary: str(front["profile_summary"]),
    aliases: strArr(front["aliases"]),
    labels: strArr(front["label"] ?? front["labels"]),
    activeYears: str(front["active_years"]),
    debut: front["debut"] != null ? (front["debut"] as string | number) : undefined,
    origin: str(front["origin"]),
    country: str(front["country"]),
    city: str(front["city"]),
    links,
    primaryGenres: strArr(front["primary_genres"]),
    secondaryGenres: strArr(front["secondary_genres"]),
    moodTags: strArr(front["mood_tags"]),
    clusterTags: strArr(front["cluster_tags"]),
    mechanisms: strArr(front["mechanisms"]),
    playlistRoles: strArr(front["playlist_roles"]),
    linkedExternalTrackIds: [],
    linkedCatalogTrackIds: [],
    linkedAlbumIds: [],
    parseWarnings: warnings,
  };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loadArtistProfiles(): Promise<ArtistProfile[]> {
  const dir = `${__LIBRARY_ROOT__}/intelligence/artists`;

  let entries: Array<{ name: string; path: string }> = [];
  try {
    const resp = await fetch(`/library-ls-text?path=${encodeURIComponent(dir)}&ext=.md`);
    if (!resp.ok) return [];
    entries = await resp.json();
  } catch {
    return [];
  }

  if (!entries.length) return [];

  const profiles: ArtistProfile[] = [];
  await Promise.all(
    entries.map(async ({ name, path: filePath }) => {
      try {
        const resp = await fetch(`/library-data?path=${encodeURIComponent(filePath)}`);
        if (!resp.ok) return;
        const md = await resp.text();
        const { front, warnings } = parseYamlFrontmatter(md);
        profiles.push(profileFromFrontmatter(front, name, filePath, warnings));
      } catch (e) {
        profiles.push({
          artistId: `artist_${artistNameToId(filenameToDisplayName(name))}`,
          displayName: filenameToDisplayName(name),
          filename: name,
          sourcePath: filePath,
          aliases: [],
          labels: [],
          links: {},
          primaryGenres: [],
          secondaryGenres: [],
          moodTags: [],
          clusterTags: [],
          mechanisms: [],
          playlistRoles: [],
          linkedExternalTrackIds: [],
          linkedCatalogTrackIds: [],
          linkedAlbumIds: [],
          parseWarnings: [`Parse error: ${String(e)}`],
        });
      }
    }),
  );

  return profiles.sort((a, b) =>
    (a.sortName ?? a.displayName).localeCompare(b.sortName ?? b.displayName),
  );
}
