import { describe, expect, it } from "vitest";
import { getSprayBackground, SPRAY_BACKGROUNDS } from "./Backgrounds";

describe("spray backgrounds", () => {
  it("provides four stable wall choices", () => {
    expect(SPRAY_BACKGROUNDS.map((background) => background.id)).toEqual([
      "black",
      "charcoal",
      "mid-gray",
      "off-white",
    ]);
  });

  it("falls back safely to black", () => {
    expect(getSprayBackground("unknown").id).toBe("black");
  });
});
