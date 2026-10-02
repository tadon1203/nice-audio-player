import { describe, expect, it } from "vitest";
import type { ArtworkRef } from "./bindings";
import { artworkUrl } from "./artwork-url";

describe("artworkUrl", () => {
  const hash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const jpeg: ArtworkRef = { contentHash: hash, mimeType: "jpeg", relativePath: `artwork/ab/${hash}.jpg` };

  it("maps the full level to the original", () => {
    expect(artworkUrl(jpeg, "full")).toBe(`http://nice-artwork.localhost/artwork/ab/${hash}.jpg`);
  });

  it("maps the thumb level to the thumbnail, whatever the original's type", () => {
    const thumb = `http://nice-artwork.localhost/artwork/ab/${hash}.thumb.jpg`;
    expect(artworkUrl(jpeg, "thumb")).toBe(thumb);
    expect(
      artworkUrl({ ...jpeg, mimeType: "png", relativePath: `artwork/ab/${hash}.png` }, "thumb"),
    ).toBe(thumb);
  });

  it("rejects paths that do not match the content identity", () => {
    expect(artworkUrl({ ...jpeg, mimeType: "png" }, "full")).toBeNull();
    expect(artworkUrl(null, "full")).toBeNull();
  });
});
