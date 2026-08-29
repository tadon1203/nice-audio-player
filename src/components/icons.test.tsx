/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppIcon } from "./ui/AppIcon";

describe("project icon boundaries", () => {
  it("renders semantic Lucide application icons with the shared control contract", () => {
    const { container } = render(<AppIcon name="queue" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("svg")?.getAttribute("stroke-width")).toBe("2");
  });
  it("selects static state endpoints through AppIcon", () => {
    const { rerender, container } = render(<AppIcon name="play" />);
    expect(container.querySelector("svg")).not.toBeNull();
    rerender(<AppIcon name="volumeSilent" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
