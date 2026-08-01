/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { PlayPauseIcon } from "./icons";

describe("project-owned icons", () => {
  it("keeps decorative SVGs out of the accessibility tree", () => {
    const { container } = render(<PlayPauseIcon playing={false} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });
});
