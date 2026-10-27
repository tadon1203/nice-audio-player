import { describe, expect, it } from "vitest";
import { CssMotion } from "./css-motion";
import { SpringCurve } from "./spring-curve";

function publish(reduced: boolean): { properties: Map<string, string>; remove: () => void } {
  const properties = new Map<string, string>();
  const root = {
    style: {
      setProperty: (name: string, value: string) => void properties.set(name, value),
      removeProperty: (name: string) => void properties.delete(name),
    },
  } as unknown as HTMLElement;
  const remove = CssMotion.apply(root, reduced);
  return { properties, remove };
}

describe("CssMotion.apply", () => {
  it("publishes the curve and each token's settling length", () => {
    const { properties } = publish(false);
    expect(properties.get("--motion-easing")).toBe(SpringCurve.linear);
    expect(properties.get("--motion-move-duration")).toBe("260ms");
    expect(properties.get("--default-transition-duration")).toBe("89ms");
  });

  it("is the 100ms crossfade for every token under reduced motion", () => {
    const { properties } = publish(true);
    expect(properties.get("--motion-large-duration")).toBe("100ms");
  });

  it("removes what it set", () => {
    const { properties, remove } = publish(false);
    remove();
    expect(properties.size).toBe(0);
  });
});
