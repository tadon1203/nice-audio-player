import { describe, expect, it } from "vitest";
import { applyCssMotion } from "./css-motion";
import { springLinear } from "./spring-curve";

function publish(reduced: boolean) {
  const properties = new Map<string, string>();
  const root = {
    style: {
      setProperty: (name: string, value: string) => void properties.set(name, value),
      removeProperty: (name: string) => void properties.delete(name),
    },
  } as unknown as HTMLElement;
  const remove = applyCssMotion(root, reduced);
  return { properties, remove };
}

describe("applyCssMotion", () => {
  it("publishes the curve and each token's settling length", () => {
    const { properties } = publish(false);
    expect(properties.get("--motion-easing")).toBe(springLinear);
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
