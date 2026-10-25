import { describe, expect, it } from "vitest";
import type { ArtworkRef } from "./bindings";
import { ArtworkUrl } from "./artwork-url";

describe("ArtworkUrl.of", () => {
  const hash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const origin = "http://nice-artwork.localhost";
  const withThumbnail: ArtworkRef = {
    path: `artwork/ab/${hash}.jpg`,
    thumbPath: `artwork/ab/${hash}.thumb.jpg`,
  };
  const withoutThumbnail: ArtworkRef = {
    path: `artwork/ab/${hash}.png`,
    thumbPath: `artwork/ab/${hash}.png`,
  };

  it("maps the full level to the original", () => {
    expect(ArtworkUrl.of(withThumbnail, "full")).toBe(`${origin}/artwork/ab/${hash}.jpg`);
    expect(ArtworkUrl.of(withoutThumbnail, "full")).toBe(`${origin}/artwork/ab/${hash}.png`);
  });

  it("maps the thumb level to the thumbnail, or to the original when there is none", () => {
    expect(ArtworkUrl.of(withThumbnail, "thumb")).toBe(`${origin}/artwork/ab/${hash}.thumb.jpg`);
    expect(ArtworkUrl.of(withoutThumbnail, "thumb")).toBe(`${origin}/artwork/ab/${hash}.png`);
  });

  it("returns null when there is no artwork", () => {
    expect(ArtworkUrl.of(null, "full")).toBeNull();
    expect(ArtworkUrl.of(undefined, "thumb")).toBeNull();
  });
});
