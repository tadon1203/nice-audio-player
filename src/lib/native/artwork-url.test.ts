import { describe, expect, it } from "vitest";
import type { ArtworkRef } from "./bindings";
import { ArtworkUrl } from "./artwork-url";

describe("ArtworkUrl.of", () => {
  const hash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const jpeg: ArtworkRef = { hash, mimeType: "jpeg" };
  const png: ArtworkRef = { hash, mimeType: "png" };
  const origin = "http://nice-artwork.localhost/artwork/ab";

  it("maps the full level to the original, with the extension of its MIME type", () => {
    expect(ArtworkUrl.of(jpeg, "full")).toBe(`${origin}/${hash}.jpg`);
    expect(ArtworkUrl.of(png, "full")).toBe(`${origin}/${hash}.png`);
  });

  it("maps the thumb level to the thumbnail, whatever the original's type", () => {
    const thumb = `${origin}/${hash}.thumb.jpg`;
    expect(ArtworkUrl.of(jpeg, "thumb")).toBe(thumb);
    expect(ArtworkUrl.of(png, "thumb")).toBe(thumb);
  });

  it("returns null when there is no artwork", () => {
    expect(ArtworkUrl.of(null, "full")).toBeNull();
    expect(ArtworkUrl.of(undefined, "thumb")).toBeNull();
  });
});
