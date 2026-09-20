import { describe, expect, it } from "vitest";
import { isTrustedRendererUrl } from "../security";

describe("Electron renderer boundary", () => {
  it("accepts only the production renderer protocol", () => {
    expect(isTrustedRendererUrl("nice-player://renderer/")).toBe(true);
    expect(isTrustedRendererUrl("https://evil.example/")).toBe(false);
    expect(isTrustedRendererUrl("file:///tmp/index.html")).toBe(false);
  });
});
