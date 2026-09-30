import { describe, expect, it } from "vitest";
import { artworkUrl } from "./artwork-url";

describe("artworkUrl", () => {
  const hash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  it("maps canonical artwork identities to the custom protocol", () => {
    expect(
      artworkUrl({ contentHash: hash, mimeType: "jpeg", relativePath: `artwork/ab/${hash}.jpg` }),
    ).toBe(`http://nice-artwork.localhost/artwork/ab/${hash}.jpg`);
  });

  it("rejects paths that do not match the content identity", () => {
    expect(
      artworkUrl({ contentHash: hash, mimeType: "png", relativePath: `artwork/ab/${hash}.jpg` }),
    ).toBeNull();
    expect(artworkUrl(null)).toBeNull();
  });
});
