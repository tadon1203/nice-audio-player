/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppIcon } from "./ui/AppIcon";
import { StateIcon } from "./ui/StateIcon";

describe("project icon boundaries", () => {
  it("renders semantic Lucide application icons with the shared control contract", () => {
    const { container } = render(<AppIcon name="queue" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("svg")?.getAttribute("stroke-width")).toBe("2");
  });
  it("selects semantic state endpoints without exposing path data as an API", () => {
    const { rerender, container } = render(<StateIcon state="play" />);
    expect(container.querySelector("svg")).not.toBeNull();
    rerender(<StateIcon state="silent" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
