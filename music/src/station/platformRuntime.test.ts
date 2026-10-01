import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// platformRuntime.ts is DOM-heavy (no jsdom configured in this repo --
// consistent with stationCoverRuntime.ts's own identical precedent, which
// also has no .test.ts companion). This file instead asserts the one real,
// structurally-verifiable invariant STATION-08 requires directly against
// the real source text: Platform must never construct its own
// MemberIdentityAuthority or RadioChannelReceiver -- both stay entirely the
// persistent HOME parent's.
describe("platformRuntime.ts -- MEMBER/RADIO ownership (STATION-08)", () => {
  const source = readFileSync(new URL("./platformRuntime.ts", import.meta.url), "utf-8");

  it("never imports or calls createFirebaseMemberIdentityAuthority -- MEMBER identity stays entirely the persistent parent's", () => {
    expect(source).not.toMatch(/createFirebaseMemberIdentityAuthority/);
  });

  it("never imports or calls createRadioChannelReceiver -- RADIO ownership stays entirely the persistent parent's", () => {
    expect(source).not.toMatch(/createRadioChannelReceiver/);
  });

  it("never imports getMemberIdentity/getRadioSession either -- Platform renders no MEMBER/RADIO UI of its own at all (both already persist automatically as HOME's own permanent chrome)", () => {
    expect(source).not.toMatch(/getMemberIdentity/);
    expect(source).not.toMatch(/getRadioSession/);
  });

  it("uses the exact, unmodified STATION-07 topology pipeline -- imports projectStationTopology and renderStationTopologySvg, never a second/parallel topology model", () => {
    expect(source).toMatch(/import\s*\{\s*projectStationTopology\s*\}\s*from\s*"\.\.\/logic\/maps\/stationTopologyProjection"/);
    expect(source).toMatch(/import\s*\{\s*renderStationTopologySvg\s*\}\s*from\s*"\.\.\/logic\/maps\/stationTopologySvgRenderer"/);
  });

  it("never branches on an archetype id -- no UG_SIDE_2TRACK/UG_SIDE_4TRACK/UG_ISLAND_2TRACK identifier anywhere in this file", () => {
    expect(source).not.toMatch(/UG_SIDE_2TRACK|UG_SIDE_4TRACK|UG_ISLAND_2TRACK|archetypeId/);
  });

  it("never hardcodes Bay Ridge Av's gtfsStopId (R42) as a navigation/identity default -- the only R42 reference anywhere in this codebase's Platform path is stationGeometryRegistry.ts's own honest data-availability table, not this file", () => {
    expect(source).not.toMatch(/"R42"|'R42'/);
  });
});

// STATION-10 (0915_WOS_Subway_Detail_Subject_Selection_Proof_v1.0.0) --
// proves the Overview-click -> StationDetailSubjectRef -> resolve -> Detail
// View chain reuses the real resolver (never a second/parallel one), never
// branches on writability or archetype identity, and introduces no
// drawing/Artwork concept -- same static-source strategy as the STATION-08
// describe block above, for the same reason (no jsdom configured here).
describe("platformRuntime.ts -- Detail Subject selection (STATION-10)", () => {
  const source = readFileSync(new URL("./platformRuntime.ts", import.meta.url), "utf-8");

  it("resolves Overview selections against the real resolver -- imports resolveStationDetailSubject, never a second/parallel resolution scheme", () => {
    expect(source).toMatch(/import\s*\{\s*isStationDetailSubjectKind,\s*resolveStationDetailSubject\s*\}\s*from\s*"\.\.\/logic\/maps\/stationDetailSubjectResolver"/);
  });

  it("never branches on an archetype id in the new selection/resolution code either", () => {
    expect(source).not.toMatch(/UG_SIDE_2TRACK|UG_SIDE_4TRACK|UG_ISLAND_2TRACK|archetypeId/);
  });

  it("never reads .suitableForArt when resolving a selection -- selectability never depends on writability", () => {
    expect(source).not.toMatch(/\.suitableForArt/);
  });

  it("builds every StationDetailSubjectRef from the real, currently-loaded geometry's own id -- never a hardcoded/synthetic stationGeometryId", () => {
    expect(source).toMatch(/stationGeometryId:\s*currentGeometry\.id/);
  });

  it("still creates no Artwork/Placement/Canvas/Marks concept -- this batch is read-only subject identification only", () => {
    expect(source).not.toMatch(/Artwork|Placement|Canvas|\bMarks?\b/);
  });
});
