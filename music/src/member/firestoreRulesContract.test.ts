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
});
