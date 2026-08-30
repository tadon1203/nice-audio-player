import { describe, expect, it } from "vitest";
import {
  countInlineStyleObjects,
  findLegacyVisualClasses,
  findPolicyViolations,
  hasClosedPrimitiveOverride,
  hasStylingClassTestDependency,
} from "./frontend-architecture-policy.mjs";

describe("frontend architecture policy", () => {
  it("rejects deleted feature classes", () => {
    expect(findLegacyVisualClasses('className="album-detail__content"')).toContain(
      "album-detail__content",
    );
  });
  it("rejects deleted tooltip classes", () => {
    expect(findLegacyVisualClasses('className="tooltip__content"')).toContain("tooltip__content");
  });
  it("rejects styling class selectors in browser tests", () => {
    expect(hasStylingClassTestDependency('page.locator(".playback-dock__layout")')).toBe(true);
  });
  it("rejects caller className on closed primitives", () => {
    expect(hasClosedPrimitiveOverride('<Button className="text-red-500" />')).toBe(true);
  });
  it("rejects Dock translation corrections", () => {
    expect(
      findPolicyViolations({ path: "src/components/PlaybackDock.tsx", source: "-translate-y-2" }),
    ).toContain("Dock controls must not use geometry correction offsets");
  });
  it("rejects a third TracksView inline style object", () => {
    const source = "style={{}} style={{}} style={{}}";
    expect(countInlineStyleObjects(source)).toBe(3);
    expect(findPolicyViolations({ path: "src/features/library/TracksView.tsx", source })).toContain(
      "TracksView may contain exactly two virtualization inline style objects",
    );
  });
});
