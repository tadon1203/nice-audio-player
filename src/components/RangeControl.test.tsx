/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RangeControl } from "./RangeControl";

describe("RangeControl", () => {
  it("uses the Base UI slider as its semantic control", () => {
    render(
      <RangeControl
        aria-label="Playback position"
        aria-valuetext="50 percent"
        value={50}
        min={0}
        max={100}
        step={1}
        onValueChange={vi.fn()}
        onValueCommitted={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("50")).toHaveAttribute("aria-valuetext", "50 percent");
    expect(document.querySelector(".range-control__track")).toBeInTheDocument();
  });

  it("keeps the product hit region and disabled semantics", () => {
    const { container } = render(
      <RangeControl
        aria-label="Volume"
        value={0}
        min={0}
        max={100}
        step={1}
        disabled
        onValueChange={vi.fn()}
      />,
    );
    expect(container.querySelector(".range-control")).toHaveAttribute("data-disabled");
    expect(screen.getByDisplayValue("0")).toBeDisabled();
  });
});
