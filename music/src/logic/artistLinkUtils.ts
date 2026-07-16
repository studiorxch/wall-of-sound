import type { ArtistProfile } from "../data/artistProfileTypes";
import type { ExternalTrackRecord } from "../data/externalTrackTypes";

// --- Platform display order ---

export const PLATFORM_ORDER = [
  "soundcloud",
  "bandcamp",
  "spotify",
  "apple_music",
  "tidal",
  "beatport",
  "resident_advisor",
  "youtube",
  "instagram",
  "facebook",
  "x",
  "tiktok",
  "twitch",
  "discogs",
  "wikipedia",
  "website",
] as const;

// --- SVG icon definitions ---

export type PlatformIconDef = {
  viewBox: string;
  inner: string; // raw SVG inner HTML (paths, g elements with transforms)
};

export const PLATFORM_ICONS: Record<string, PlatformIconDef> = {
  bandcamp: {
    viewBox: "0 0 483 336",
    inner: `<path d="M2124.47 494.77H0l992.094 1831.34H3116.58z" transform="matrix(.13333 0 0 -.13333 33.545 356.059)"/>`,
  },
  beatport: {
    viewBox: "0 0 800 800",
    inner: `<path d="M488.933,800c-128.566,0 -231.166,-101.3 -231.166,-232.467c-0.185,-58.063 21.371,-114.143 60.4,-157.133l-157.134,157.133l-82.466,-82.466l177.3,-175.334c24,-24 36.333,-55.2 36.333,-89.6l0,-220.133l116.233,0l0,220.133c0,67.534 -24,124.667 -70.766,171.434l-5.2,5.2c42.759,-38.971 98.612,-60.532 156.466,-60.4c131.834,-0 232.5,104.533 232.5,231.166c0.002,0.346 0.003,0.691 0.003,1.036c-0,126.961 -104.473,231.433 -231.434,231.433c-0.356,0 -0.712,-0 -1.069,-0.002Zm0,-357.133c-70.766,-0 -125.966,58.433 -125.966,124.666c-0,68.167 55.833,126 126,126c69.435,0.257 126.829,-56.565 127.266,-126c0,-68.833 -57.166,-124.666 -127.3,-124.666Z"/>`,
  },
  soundcloud: {
    viewBox: "0 0 39 23",
    inner: `<path d="M.2 8.5 0 10.3l.2 1.8c0 .1.1.1.1.1.1 0 .1-.1.1-.1l.3-1.8-.3-1.8c0-.1-.1-.1-.1-.1s-.1 0-.1.1m1.2-1.1-.3 2.9.3 2.9c0 .1.1.1.1.1.1 0 .1-.1.1-.1l.4-2.9-.4-2.9c0-.1-.1-.1-.1-.1zM5.2 7 5 10.3l.2 3.5c0 .1.1.2.2.2s.2-.1.2-.2l.4-3.5L5.7 7c0-.1-.1-.2-.2-.2-.2 0-.3.1-.3.2m-2.5-.2-.3 3.5.3 3.3c0 .1.1.2.2.2 0 0 .1-.1.1-.2l.3-3.3L3 6.8c0-.1-.1-.2-.2-.2 0 .1-.1.1-.1.2m1.2-.1-.3 3.6.3 3.4c0 .1.1.2.2.2s.2-.1.2-.2l.3-3.4-.3-3.6c0-.1-.1-.2-.2-.2s-.1.1-.2.2m2.6-1.8-.3 5.4.3 3.5c0 .1.1.2.2.2.2 0 .3-.1.3-.2l.3-3.5L7 4.9c0-.1-.1-.2-.2-.2-.2 0-.3.1-.3.2m1.3-1.2-.2 6.6.2 3.5q0 .3.3.3c.1 0 .3-.1.3-.3l.3-3.5-.3-6.6q0-.3-.3-.3t-.3.3m5.3-.3-.2 6.9.2 3.3c0 .2.2.4.4.4s.4-.2.4-.4l.2-3.3-.2-7c0-.2-.2-.4-.4-.4-.3.1-.4.2-.4.5m-4-.3-.2 7.2.2 3.4q0 .3.3.3t.3-.3l.2-3.4-.2-7.2q0-.3-.3-.3c-.2 0-.3.2-.3.3m2.6 0-.2 7.2.2 3.4c0 .2.2.4.4.4s.4-.2.4-.4l.2-3.4-.2-7.2c0-.2-.2-.4-.4-.4s-.4.2-.4.4m-1.3-.2-.2 7.4.2 3.4q0 .3.3.3t.3-.3l.2-3.4-.2-7.4c0-.2-.2-.3-.3-.3s-.3.1-.3.3m4-.9-.2 8.3.2 3.3c0 .2.2.4.4.4s.4-.2.4-.4l.2-3.3-.2-8.3c0-.2-.2-.4-.4-.4s-.4.2-.4.4m1.4-.7-.2 9 .2 3.3c0 .2.2.4.4.4s.4-.2.4-.4l.2-3.3-.2-9c0-.2-.2-.4-.4-.4h-.1c-.2 0-.3.2-.3.4m1.6-.9c-.3.1-.4.2-.4.5v12.7c0 .2.2.4.4.5h11.1c2.2 0 4-1.8 4-4s-1.8-4-4-4c-.5 0-1.1.1-1.5.3-.3-3.6-3.3-6.4-7-6.4h-.5c-.7 0-1.4.2-2.1.4"/>`,
  },
  spotify: {
    viewBox: "0 0 168 168",
    inner: `<path d="M83.996.277C37.747.277.253 37.77.253 84.019c0 46.251 37.494 83.741 83.743 83.741 46.254 0 83.744-37.49 83.744-83.741 0-46.246-37.49-83.738-83.745-83.738zm38.404 120.78a5.217 5.217 0 0 1-7.18 1.73c-19.662-12.01-44.414-14.73-73.564-8.07a5.22 5.22 0 0 1-6.249-3.93 5.213 5.213 0 0 1 3.926-6.25c31.9-7.288 59.263-4.15 81.337 9.34 2.46 1.51 3.24 4.72 1.73 7.18m10.25-22.802c-1.89 3.072-5.91 4.042-8.98 2.152-22.51-13.836-56.823-17.843-83.448-9.761-3.453 1.043-7.1-.903-8.148-4.35a6.54 6.54 0 0 1 4.354-8.143c30.413-9.228 68.222-4.758 94.072 11.127 3.07 1.89 4.04 5.91 2.15 8.976zm.88-23.744c-26.99-16.031-71.52-17.505-97.289-9.684-4.138 1.255-8.514-1.081-9.768-5.219a7.835 7.835 0 0 1 5.221-9.771c29.581-8.98 78.756-7.245 109.83 11.202a7.823 7.823 0 0 1 2.74 10.733c-2.2 3.722-7.02 4.949-10.73 2.739z"/>`,
  },
  tidal: {
    viewBox: "0 0 800 800",
    inner: `<path d="M400.4,133.075l-133.475,133.475l-133.475,-133.475l-133.475,133.475l133.475,133.475l133.475,-133.475l133.475,133.475l-133.475,133.475l133.475,133.475l133.475,-133.475l-133.475,-133.475l133.475,-133.475l-133.475,-133.475Zm134.375,133.45l132.55,-132.675l132.675,132.675l-132.675,132.675l-132.55,-132.675Z"/>`,
  },
  instagram: {
    viewBox: "0 0 20 20",
    inner: `<path fill-rule="evenodd" d="M13.23 3.492c-.84-.037-1.096-.046-3.23-.046-2.144 0-2.39.01-3.238.055-.776.027-1.195.164-1.487.273a2.4 2.4 0 0 0-.912.593 2.5 2.5 0 0 0-.602.922c-.11.282-.238.702-.274 1.486-.046.84-.046 1.095-.046 3.23s.01 2.39.046 3.229c.004.51.097 1.016.274 1.495.145.365.319.639.602.913.282.282.538.456.92.602.474.176.974.268 1.479.273.848.046 1.103.046 3.238.046s2.39-.01 3.23-.046c.784-.036 1.203-.164 1.486-.273.374-.146.648-.329.921-.602.283-.283.447-.548.602-.922.177-.476.27-.979.274-1.486.037-.84.046-1.095.046-3.23s-.01-2.39-.055-3.229c-.027-.784-.164-1.204-.274-1.495a2.4 2.4 0 0 0-.593-.913 2.6 2.6 0 0 0-.92-.602c-.284-.11-.703-.237-1.488-.273ZM6.697 2.05c.857-.036 1.131-.045 3.302-.045a63 63 0 0 1 3.302.045c.664.014 1.321.14 1.943.374a4 4 0 0 1 1.414.922c.41.397.728.88.93 1.414.23.622.354 1.279.365 1.942C18 7.56 18 7.824 18 10.005c0 2.17-.01 2.444-.046 3.292-.036.858-.173 1.442-.374 1.943-.2.53-.474.976-.92 1.423a3.9 3.9 0 0 1-1.415.922c-.51.191-1.095.337-1.943.374-.857.036-1.122.045-3.302.045-2.171 0-2.445-.009-3.302-.055-.849-.027-1.432-.164-1.943-.364a4.15 4.15 0 0 1-1.414-.922 4.1 4.1 0 0 1-.93-1.423c-.183-.51-.329-1.085-.365-1.943C2.009 12.45 2 12.167 2 10.004c0-2.161 0-2.435.055-3.302.027-.848.164-1.432.365-1.942a4.4 4.4 0 0 1 .92-1.414 4.2 4.2 0 0 1 1.415-.93c.51-.183 1.094-.33 1.943-.366Zm.427 4.806a4.105 4.105 0 1 1 5.805 5.805 4.105 4.105 0 0 1-5.805-5.805m1.882 5.371a2.668 2.668 0 1 0 2.042-4.93 2.668 2.668 0 0 0-2.042 4.93m5.922-5.942a.958.958 0 1 1-1.355-1.355.958.958 0 0 1 1.355 1.355"/>`,
  },
  facebook: {
    viewBox: "0 0 20 20",
    inner: `<path d="M18 10.049C18 5.603 14.419 2 10 2s-8 3.603-8 8.049C2 14.067 4.925 17.396 8.75 18v-5.624H6.719v-2.328h2.03V8.275c0-2.017 1.195-3.132 3.023-3.132.874 0 1.79.158 1.79.158v1.98h-1.009c-.994 0-1.303.621-1.303 1.258v1.51h2.219l-.355 2.326H11.25V18c3.825-.604 6.75-3.933 6.75-7.951"/>`,
  },
  x: {
    viewBox: "0 0 20 20",
    inner: `<path d="M7.273,2.8l3.527,5.022l4.418,-5.022l1.768,-0l-5.4,6.139l5.799,8.254l-4.658,0l-3.73,-5.31l-4.671,5.31l-1.768,0l5.654,-6.427l-5.597,-7.966l4.658,0Zm6.242,13.125l-8.445,-11.816l1.405,0l8.446,11.816l-1.406,0Z"/>`,
  },
  tiktok: {
    viewBox: "0 0 20 20",
    inner: `<path d="M10.511 1.705h2.74s-.157 3.51 3.795 3.768v2.711s-2.114.129-3.796-1.158l.028 5.606A5.073 5.073 0 1 1 8.213 7.56h.708v2.785a2.298 2.298 0 1 0 1.618 2.205z"/>`,
  },
  twitch: {
    viewBox: "0 0 323 305",
    inner: `<g transform="matrix(1,0,0,1,-365,-348)"><path d="M640.8,448L641,519.5L566.5,594L523.5,594L487.5,630L475.4,630C465.3,630 463,629.7 461.9,628.3C460.8,627.1 460.5,622.6 460.4,610.6L460.2,594.5L433.9,594L407.5,593.5L407.2,504.1L407,414.8L410.9,406.1C413.1,401.4 417.1,392.7 419.9,386.7L425,376L532.8,376.2L640.5,376.5L640.8,448ZM436.2,472.2L436.5,551.5L486.5,552.5L487.5,589.5L506.5,570.7L525.6,552L554.5,552L583.5,551.9L604.3,531.7L625,511.5L625,393L436,393L436.2,472.2ZM514.5,495.5L495.5,495.5L495.2,465.2L495,434.9L504.7,435.2L514.5,435.5L514.5,495.5ZM577.5,495.5L557.5,495.5L557.2,466.5C557.1,450.6 557.2,436.9 557.5,436.2C557.8,435.3 560.4,435 567.7,435.2L577.5,435.5L577.5,495.5Z"/></g>`,
  },
  youtube: {
    viewBox: "0 0 24 24",
    inner: `<path d="M22.559,6.661c0.44,1.694 0.44,5.279 0.44,5.279c0,0 0,3.586 -0.44,5.279c-0.251,0.969 -1.01,1.729 -1.98,1.98c-1.694,0.44 -8.579,0.44 -8.579,0.44c0,0 -6.885,0 -8.579,-0.44c-0.969,-0.251 -1.729,-1.01 -1.98,-1.98c-0.44,-1.694 -0.44,-5.279 -0.44,-5.279c0,0 0,-3.586 0.44,-5.279c0.263,-0.962 1.017,-1.717 1.98,-1.98c1.694,-0.44 8.579,-0.44 8.579,-0.44c0,0 6.885,0 8.579,0.44c0.962,0.263 1.717,1.017 1.98,1.98m-12.759,8.579l5.719,-3.3l-5.719,-3.3l0,6.599Z"/>`,
  },
  // Generic fallback — simple link-out icon in 24x24 space
  _fallback: {
    viewBox: "0 0 24 24",
    inner: `<path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14"/>`,
  },
};

// --- Visible link helpers ---

export type VisibleArtistLink = {
  key: string;
  url: string;
  label: string;
  icon: PlatformIconDef;
};

const PLATFORM_LABELS: Record<string, string> = {
  website: "Website",
  bandcamp: "Bandcamp",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  apple_music: "Apple Music",
  tidal: "Tidal",
  beatport: "Beatport",
  resident_advisor: "RA",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  tiktok: "TikTok",
  twitch: "Twitch",
  discogs: "Discogs",
  wikipedia: "Wikipedia",
};

export function getVisibleArtistLinks(
  links: ArtistProfile["links"],
): VisibleArtistLink[] {
  const result: VisibleArtistLink[] = [];
  const seen = new Set<string>();

  const isValidUrl = (v: string) => v.startsWith("http://") || v.startsWith("https://");

  // Emit in PLATFORM_ORDER first
  for (const key of PLATFORM_ORDER) {
    const val = links[key];
    if (typeof val === "string" && val.trim() && isValidUrl(val.trim())) {
      seen.add(key);
      result.push({
        key,
        url: val.trim(),
        label: PLATFORM_LABELS[key] ?? key,
        icon: PLATFORM_ICONS[key] ?? PLATFORM_ICONS._fallback,
      });
    }
  }

  // Then any extra keys not in the order list
  for (const [key, val] of Object.entries(links)) {
    if (!seen.has(key) && typeof val === "string" && val.trim() && isValidUrl(val.trim())) {
      result.push({
        key,
        url: val.trim(),
        label: PLATFORM_LABELS[key] ?? key,
        icon: PLATFORM_ICONS[key] ?? PLATFORM_ICONS._fallback,
      });
    }
  }

  return result;
}

// --- Artist network preview ---

export type ArtistNetworkNode = {
  id: string;
  label: string;
  type: "artist" | "track" | "genre" | "mood" | "mechanism" | "label" | "role";
};

export type ArtistNetworkEdge = {
  source: string;
  target: string;
};

export type ArtistNetworkGroup = {
  type: ArtistNetworkNode["type"];
  label: string;
  items: string[];
};

export type ArtistNetworkPreview = {
  artistId: string;
  artistName: string;
  groups: ArtistNetworkGroup[];
  stats: {
    trackCount: number;
    genreCount: number;
    moodCount: number;
    mechanismCount: number;
    labelCount: number;
    roleCount: number;
  };
};

export function buildArtistNetworkPreview(
  profile: ArtistProfile,
  linkedTracks: ExternalTrackRecord[],
): ArtistNetworkPreview {
  const allGenres = [
    ...profile.primaryGenres,
    ...profile.secondaryGenres.filter((g) => !profile.primaryGenres.includes(g)),
  ];

  const groups: ArtistNetworkGroup[] = [];

  if (linkedTracks.length > 0) {
    groups.push({
      type: "track",
      label: "External Tracks",
      items: linkedTracks.map((t) => t.title ?? t.trackId),
    });
  }

  if (allGenres.length > 0) {
    groups.push({ type: "genre", label: "Genres", items: allGenres });
  }

  if (profile.moodTags.length > 0) {
    groups.push({ type: "mood", label: "Moods", items: profile.moodTags });
  }

  if (profile.mechanisms.length > 0) {
    groups.push({ type: "mechanism", label: "Mechanisms", items: profile.mechanisms });
  }

  if (profile.labels.length > 0) {
    groups.push({ type: "label", label: "Labels", items: profile.labels });
  }

  if (profile.playlistRoles.length > 0) {
    groups.push({ type: "role", label: "Playlist Roles", items: profile.playlistRoles });
  }

  return {
    artistId: profile.artistId,
    artistName: profile.displayName,
    groups,
    stats: {
      trackCount: linkedTracks.length,
      genreCount: allGenres.length,
      moodCount: profile.moodTags.length,
      mechanismCount: profile.mechanisms.length,
      labelCount: profile.labels.length,
      roleCount: profile.playlistRoles.length,
    },
  };
}
