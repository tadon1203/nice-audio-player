import { describe, expect, it } from "vitest";
import { resolveArtworkRequest } from "../src/main/shared/electron/artwork-protocol";
import { resolveRequestedPath } from "../src/main/shared/electron/renderer-protocol";

const hash = "ab".repeat(32);

describe("native boundary protocols", () => {
  it("resolves only canonical artwork identities below userData", () => {
    const resolved = resolveArtworkRequest(
      "C:\\data",
      `nice-artwork://asset/artwork/ab/${hash}.jpg`,
    );
    expect(resolved?.mimeType).toBe("image/jpeg");
    expect(resolved?.path).toBe(`C:\\data\\artwork\\ab\\${hash}.jpg`);
    expect(
      resolveArtworkRequest("C:\\data", "nice-artwork://asset/artwork/../secret.png"),
    ).toBeNull();
    expect(
      resolveArtworkRequest("C:\\data", `nice-artwork://asset/artwork/aa/${hash}.jpg`),
    ).toBeNull();
  });

  it("keeps renderer requests rooted in the renderer build", () => {
    expect(resolveRequestedPath("C:\\app\\out\\renderer", "nice-player://renderer/")).toBe(
      "C:\\app\\out\\renderer\\index.html",
    );
    expect(
      resolveRequestedPath("C:\\app\\out\\renderer", "nice-player://renderer/assets/app.js"),
    ).toBe("C:\\app\\out\\renderer\\assets\\app.js");
  });
});
