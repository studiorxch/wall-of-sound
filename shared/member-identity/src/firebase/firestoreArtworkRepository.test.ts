import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { decodeArtworkData } from "./firestoreArtworkRepository.js";

describe("legacy Artwork compatibility", () => {
  it("hydrates a legacy geographic stroke as one canonical Stroke Mark", () => {
    const time = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));
    const artwork = decodeArtworkData("legacy-a", {
      creatorId: "member-1", createdAt: time, updatedAt: time,
      surface: { type: "map" },
      geometry: { format: "geographic-strokes-v1", strokes: [{ id: "stroke-1", points: [{ longitude: -73.99, latitude: 40.72 }, { longitude: -73.98, latitude: 40.73 }], style: { color: "#fff", width: 4, opacity: 1 } }] },
      state: "draft", visibility: "private",
    });
    expect(artwork.surfaceId).toBe("map:new-york");
    expect(artwork.marks).toHaveLength(1);
    expect(artwork.marks[0]).toMatchObject({ id: "stroke-1", type: "stroke", geometry: { format: "geographic-stroke-v1" } });
    expect(artwork.composition.bounds).toEqual({ west: -73.99, south: 40.72, east: -73.98, north: 40.73 });
  });
});
