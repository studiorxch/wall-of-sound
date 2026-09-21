import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rules = readFileSync(resolve(process.cwd(), "../firestore.rules"), "utf8");

describe("Firestore Member and Artwork ownership contract", () => {
  it("requires authenticated UID equality for Member documents", () => {
    expect(rules).toContain("request.auth.uid == uid");
  });

  it("rejects forged Artwork ownership on create and update", () => {
    const artworkBlock = rules.slice(rules.indexOf("match /artworks/{artworkId}"));
    expect(artworkBlock.match(/request\.resource\.data\.creatorId == request\.auth\.uid/g)).toHaveLength(2);
    expect(artworkBlock).toContain("resource.data.creatorId == request.auth.uid");
    expect(artworkBlock).toContain("request.resource.data.createdAt == resource.data.createdAt");
  });

  it("keeps new Artwork private/draft and leaves unmatched paths denied", () => {
    expect(rules).toContain("request.resource.data.state == 'draft'");
    expect(rules).toContain("request.resource.data.visibility == 'private'");
    expect(rules).not.toMatch(/match \/\{document=\*\*\}[\s\S]*allow/);
  });

  it("accepts the embedded Mark composition shape while preserving legacy compatibility", () => {
    expect(rules).toContain("hasValidArtworkV1Shape");
    expect(rules).toContain("hasValidStrokeMark");
    expect(rules).toContain("data.marks.size() >= 1");
    expect(rules).toContain("request.resource.data.surfaceId == resource.data.surfaceId");
    expect(rules).toContain("hasValidArtworkShape(request.resource.data) || hasValidArtworkV1Shape(request.resource.data)");
  });

  it("allows Pencil material metadata and graphite-only authored Eraser Marks", () => {
    expect(rules).toContain("'material'");
    expect(rules).toContain("hasValidMaterialErasureMark");
    expect(rules).toContain("mark.targetMaterialId == 'graphite'");
    expect(rules).toContain("hasValidStrokeMark(mark) || hasValidMaterialErasureMark(mark)");
  });

  it("allows only the canonical Pen/Ink and Marker/Marker material pairs", () => {
    expect(rules).toContain("mark.material.supplyId == 'pen' && mark.material.materialId == 'ink'");
    expect(rules).toContain("mark.material.supplyId == 'marker' && mark.material.materialId == 'marker'");
    expect(rules).toContain("mark.targetMaterialId == 'graphite'");
  });

  it("accepts local Blackbook geometry and local bounds without weakening ownership", () => {
    expect(rules).toContain("'local-2d-stroke-v1'");
    expect(rules).toContain("['minX', 'minY', 'maxX', 'maxY']");
    expect(rules).toContain("allow read: if isSignedIn() && resource.data.creatorId == request.auth.uid");
  });
});
