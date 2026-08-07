import { describe, it, expect, vi, afterEach } from "vitest";
import { geocode, geocodeToStop, fetchRouteSet } from "./itineraryRouting";

const TOKEN = "test-token";
const ORIGIN = { id: "a", name: "A", longitude: -74.01, latitude: 40.71 };
const DESTINATION = { id: "b", name: "B", longitude: -74.02, latitude: 40.72 };

describe("itineraryRouting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("geocode / geocodeToStop", () => {
    it("reports no_token when no Mapbox token is available — never confused with a genuine zero-result", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const result = await geocode("388 Pearl St", undefined);
      expect(result).toEqual({ ok: false, reason: "no_token" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("parses a real geocoding response into a GeocodeResult", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ place_name: "388 Pearl St, New York, NY", center: [-74.005, 40.712], id: "place.123" }],
        }),
      }));
      const result = await geocode("388 Pearl St", TOKEN);
      expect(result).toEqual({
        ok: true,
        data: { name: "388 Pearl St, New York, NY", longitude: -74.005, latitude: 40.712, placeId: "place.123" },
      });
    });

    it("geocodeToStop wraps a real result into a LocationRef with a generated stop id", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ features: [{ place_name: "Atlanta, GA", center: [-84.39, 33.75] }] }),
      }));
      const stop = await geocodeToStop("Atlanta, GA", TOKEN);
      expect(stop?.name).toBe("Atlanta, GA");
      expect(stop?.longitude).toBe(-84.39);
      expect(typeof stop?.id).toBe("string");
    });

    it("reports no_match when the geocoder genuinely finds nothing", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }));
      expect(await geocode("asdkjhaskjdh", TOKEN)).toEqual({ ok: false, reason: "no_match" });
    });

    it("reports network_error when fetch throws — distinct from a genuine zero-result", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      expect(await geocode("Brooklyn, NY", TOKEN)).toEqual({ ok: false, reason: "network_error" });
    });

    it("reports http_error on a non-ok HTTP response — distinct from a genuine zero-result", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Not Authorized" }) }));
      expect(await geocode("Brooklyn, NY", TOKEN)).toEqual({ ok: false, reason: "http_error" });
    });

    it("geocodeToStop returns null for any failure reason, not just no_match", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      expect(await geocodeToStop("Brooklyn, NY", TOKEN)).toBeNull();
    });
  });

  describe("fetchRouteSet — mode honesty guard", () => {
    it("throws for transit — never silently computes or calls Directions", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      await expect(fetchRouteSet(ORIGIN, DESTINATION, "transit", TOKEN)).rejects.toThrow(/non-routable/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("throws for flight — never silently computes or calls Directions", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      await expect(fetchRouteSet(ORIGIN, DESTINATION, "flight", TOKEN)).rejects.toThrow(/non-routable/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("throws for other — never silently computes or calls Directions", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      await expect(fetchRouteSet(ORIGIN, DESTINATION, "other", TOKEN)).rejects.toThrow(/non-routable/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("requests alternatives=true&steps=true for driving", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        json: async () => ({
          routes: [
            {
              geometry: { type: "LineString", coordinates: [[-74.01, 40.71], [-74.02, 40.72]] },
              distance: 1500,
              duration: 300,
              legs: [{ steps: [{ maneuver: { instruction: "Head north", type: "depart", location: [-74.01, 40.71] }, distance: 1500, duration: 300 }] }],
            },
          ],
        }),
      });
      vi.stubGlobal("fetch", fetchSpy);
      const routeSet = await fetchRouteSet(ORIGIN, DESTINATION, "driving", TOKEN);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain("alternatives=true");
      expect(calledUrl).toContain("steps=true");
      expect(calledUrl).toContain("/directions/v5/mapbox/driving/");
      expect(routeSet.mode).toBe("driving");
      expect(routeSet.routes).toHaveLength(1);
      expect(routeSet.routes[0].distanceMeters).toBe(1500);
      expect(routeSet.routes[0].durationSeconds).toBe(300);
      expect(routeSet.routes[0].steps).toHaveLength(1);
      expect(routeSet.fetchedAt).not.toBeNull();
    });

    it("preserves real multiple alternatives, capped at 3, never flattened into one line", async () => {
      const mkRoute = (distance: number) => ({
        geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        distance,
        duration: distance / 5,
        legs: [{ steps: [] }],
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        json: async () => ({ routes: [mkRoute(1000), mkRoute(1200), mkRoute(1400), mkRoute(1600)] }),
      }));
      const routeSet = await fetchRouteSet(ORIGIN, DESTINATION, "walking", TOKEN);
      expect(routeSet.routes).toHaveLength(3);
      expect(routeSet.routes.map((r) => r.distanceMeters)).toEqual([1000, 1200, 1400]);
      // each alternative keeps its own distinct id — not collapsed into one
      expect(new Set(routeSet.routes.map((r) => r.id)).size).toBe(3);
    });

    it("returns an empty, real RouteSet (never a fabricated route) when no token is available", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const routeSet = await fetchRouteSet(ORIGIN, DESTINATION, "cycling", undefined);
      expect(routeSet.routes).toEqual([]);
      expect(routeSet.fetchedAt).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
