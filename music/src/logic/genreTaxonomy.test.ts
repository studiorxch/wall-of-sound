import { describe, it, expect } from "vitest";
import {
  normalizeGenreTokens,
  normalizeTrackGenreTokens,
  normalizeTrackGenreIndexTokens,
  isGenreIndexToken,
} from "./genreTaxonomy";

describe("normalizeGenreTokens", () => {
  it("returns [] for null, undefined, empty, and whitespace-only input", () => {
    expect(normalizeGenreTokens(null)).toEqual([]);
    expect(normalizeGenreTokens(undefined)).toEqual([]);
    expect(normalizeGenreTokens("")).toEqual([]);
    expect(normalizeGenreTokens("   ")).toEqual([]);
  });

  it("returns one canonical token for a scalar genre", () => {
    expect(normalizeGenreTokens("techno")).toEqual(["techno"]);
  });

  it("flattens a string array without mutation", () => {
    const input = ["techno", "house"] as const;
    expect(normalizeGenreTokens(input)).toEqual(["techno", "house"]);
    expect(input).toEqual(["techno", "house"]);
  });

  it("splits comma-delimited values correctly", () => {
    expect(normalizeGenreTokens("ambient, jungle, lo-fi")).toEqual(["ambient", "jungle", "lo-fi"]);
  });

  it("splits semicolon-delimited values correctly", () => {
    expect(normalizeGenreTokens("ambient; jungle; lo-fi")).toEqual(["ambient", "jungle", "lo-fi"]);
  });

  it("normalizes whitespace and case variants consistently, lowercasing canonical output", () => {
    expect(normalizeGenreTokens("  Ambient ,   Jungle  ")).toEqual(["ambient", "jungle"]);
  });

  it("collapses lofi, lo fi, and lo-fi to one lo-fi token", () => {
    expect(normalizeGenreTokens(["lofi", "lo fi", "lo-fi"])).toEqual(["lo-fi"]);
  });

  it("repairs lo-fi-fi and lo-filo-fi to lo-fi", () => {
    expect(normalizeGenreTokens("lo-fi-fi")).toEqual(["lo-fi"]);
    expect(normalizeGenreTokens("lo-filo-fi")).toEqual(["lo-fi"]);
  });

  it("repairs lo-fiambient to lo-fi and ambient", () => {
    expect(normalizeGenreTokens("lo-fiambient")).toEqual(["lo-fi", "ambient"]);
  });

  it("collapses drum and bass, dnb, and drum & bass correctly", () => {
    expect(normalizeGenreTokens(["drum and bass", "dnb", "drum & bass"])).toEqual(["drum & bass"]);
  });

  it("collapses electronica to electronic", () => {
    expect(normalizeGenreTokens("electronica")).toEqual(["electronic"]);
  });

  it("counts duplicate aliases within one track once", () => {
    expect(normalizeGenreTokens("lofi, lo-fi")).toEqual(["lo-fi"]);
  });

  it("preserves first-seen ordering", () => {
    expect(normalizeGenreTokens("jungle, lo-fi, ambient, lofi")).toEqual(["jungle", "lo-fi", "ambient"]);
  });

  it("keeps unknown tokens visible after trimming", () => {
    expect(normalizeGenreTokens(" cinematic , experimental ")).toEqual(["cinematic", "experimental"]);
  });

  it("does not treat ampersands, slashes, hyphens, or internal spaces as generic delimiters", () => {
    expect(normalizeGenreTokens("drum & bass")).toEqual(["drum & bass"]);
    expect(normalizeGenreTokens("jungle / d&b")).toEqual(["jungle / d&b"]);
    expect(normalizeGenreTokens("hip-hop")).toEqual(["hip-hop"]);
    expect(normalizeGenreTokens("chillhop, downtempo, lo-fi hip hop")).toEqual([
      "chillhop",
      "downtempo",
      "lo-fi hip hop",
    ]);
  });

  it("is idempotent", () => {
    const value = "ambient, jungle, lo-fi, lofi, drum and bass, lo-fi-fi, lo-fiambient";
    const once = normalizeGenreTokens(value);
    const twice = normalizeGenreTokens(once);
    expect(twice).toEqual(once);
  });

  it("does not alias unresolved-distinction pairs", () => {
    expect(normalizeGenreTokens("jungle")).toEqual(["jungle"]);
    expect(normalizeGenreTokens("chillhop")).toEqual(["chillhop"]);
    expect(normalizeGenreTokens("lo-fi hip-hop")).toEqual(["lo-fi hip-hop"]);
  });
});

describe("canonical lowercase rule (0714L)", () => {
  it("normalizes mixed-case unknown genres to lowercase", () => {
    expect(normalizeGenreTokens("Cinematic")).toEqual(["cinematic"]);
    expect(normalizeGenreTokens("EXPERIMENTAL")).toEqual(["experimental"]);
  });

  it("deduplicates Nocturnal, nocturnal, and NOCTURNAL to one nocturnal token", () => {
    expect(normalizeGenreTokens("Nocturnal, nocturnal, NOCTURNAL")).toEqual(["nocturnal"]);
  });

  it("returns lowercase canonical tokens for existing aliases regardless of input case", () => {
    expect(normalizeGenreTokens("LoFi")).toEqual(["lo-fi"]);
    expect(normalizeGenreTokens("R&B")).toEqual(["r&b"]);
    expect(normalizeGenreTokens("Drum & Bass")).toEqual(["drum & bass"]);
  });

  it("lowercasing remains idempotent", () => {
    const once = normalizeGenreTokens("Nocturnal, nocturnal, NOCTURNAL");
    const twice = normalizeGenreTokens(once);
    expect(twice).toEqual(once);
  });

  it("does not mutate raw input strings or arrays", () => {
    const input = ["Nocturnal", "NOCTURNAL"] as const;
    normalizeGenreTokens(input);
    expect(input).toEqual(["Nocturnal", "NOCTURNAL"]);
  });
});

describe("urban. ambient. hip-hop exact repair (0714L)", () => {
  it("repairs the exact malformed value into three tokens", () => {
    expect(normalizeGenreTokens("urban. ambient. hip-hop")).toEqual(["urban", "ambient", "hip-hop"]);
  });

  it("repairs a mixed-case form of the exact malformed value", () => {
    expect(normalizeGenreTokens("Urban. Ambient. Hip-Hop")).toEqual(["urban", "ambient", "hip-hop"]);
  });

  it("does not generically split unrelated period-containing values", () => {
    expect(normalizeGenreTokens("R.E.M.")).toEqual(["r.e.m."]);
    expect(normalizeGenreTokens("Dr. Seuss Vol. 2")).toEqual(["dr. seuss vol. 2"]);
  });
});

describe("nocturnal lo-fi suite unresolved loose term (0714L)", () => {
  it("preserves it as one lowercase token, never split or decomposed", () => {
    expect(normalizeGenreTokens("Nocturnal lo-fi suite")).toEqual(["nocturnal lo-fi suite"]);
  });
});

describe("Genre-index eligibility rule — isGenreIndexToken / closing exclusion (0714L)", () => {
  it("excludes the exact canonical token closing", () => {
    expect(isGenreIndexToken("closing")).toBe(false);
  });

  it("excludes a mixed-case Closing after normalization", () => {
    const tokens = normalizeGenreTokens("Closing");
    expect(tokens).toEqual(["closing"]);
    expect(tokens.filter(isGenreIndexToken)).toEqual([]);
  });

  it("preserves non-exact terms that merely contain closing", () => {
    expect(isGenreIndexToken("closing-time jazz")).toBe(true);
    expect(normalizeGenreTokens("closing-time jazz").filter(isGenreIndexToken)).toEqual(["closing-time jazz"]);
  });

  it("excludes closing consistently through normalizeTrackGenreIndexTokens", () => {
    const track = { genre: "ambient, closing", genres: [] as string[] };
    expect(normalizeTrackGenreIndexTokens(track)).toEqual(["ambient"]);
    // non-index consumer still sees the raw normalized token
    expect(normalizeTrackGenreTokens(track)).toEqual(["ambient", "closing"]);
  });
});

describe("production-shaped fixture reproducing the four visible defect cases (0714L)", () => {
  it("collapses Nocturnal/nocturnal, repairs urban. ambient. hip-hop, excludes closing, preserves nocturnal lo-fi suite", () => {
    const tracks = [
      { genre: "Nocturnal", genres: [] as string[] },
      { genre: "nocturnal", genres: [] as string[] },
      { genre: "Closing", genres: [] as string[] },
      { genre: "urban. ambient. hip-hop", genres: [] as string[] },
      { genre: "Nocturnal lo-fi suite", genres: [] as string[] },
    ];

    const counts = new Map<string, number>();
    for (const t of tracks) {
      for (const token of normalizeTrackGenreIndexTokens(t)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }

    expect(counts.get("nocturnal")).toBe(2);
    expect(counts.has("closing")).toBe(false);
    expect(counts.get("urban")).toBe(1);
    expect(counts.get("ambient")).toBe(1);
    expect(counts.get("hip-hop")).toBe(1);
    expect(counts.get("nocturnal lo-fi suite")).toBe(1);
  });
});

describe("normalizeTrackGenreTokens aggregation/filtering parity", () => {
  it("aggregation counts each canonical token at most once per track", () => {
    const track = { genre: "ambient, jungle, lo-fi", genres: ["lofi"] };
    expect(normalizeTrackGenreTokens(track)).toEqual(["ambient", "jungle", "lo-fi"]);
  });

  it("filtering uses the same canonical token source as aggregation", () => {
    const track = { genre: "lofi", genres: [] as string[] };
    const tokens = normalizeTrackGenreTokens(track);
    expect(tokens).toContain("lo-fi");
  });

  it("existing raw values remain unchanged after normalization (no mutation)", () => {
    const track = { genre: "ambient, jungle, lo-fi", genres: ["lofi"] };
    normalizeTrackGenreTokens(track);
    expect(track.genre).toBe("ambient, jungle, lo-fi");
    expect(track.genres).toEqual(["lofi"]);
  });

  it("regression: no comma/semicolon compound card is emitted from the supplied malformed examples", () => {
    const rawCards = [
      "ambient, jungle, lo-fi",
      "electronic, jungle, lo-fi",
      "ambient, electronic, experimental",
      "cinematic, electronic, lo-fi",
      "chillhop, downtempo, lo-fi hip hop",
    ];
    for (const raw of rawCards) {
      const tokens = normalizeGenreTokens(raw);
      for (const token of tokens) {
        expect(token.includes(",")).toBe(false);
        expect(token.includes(";")).toBe(false);
      }
    }
  });
});
