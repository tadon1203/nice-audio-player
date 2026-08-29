/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Slider } from "./slider";

describe("Slider", () => {
  it("renders one Base UI thumb for every range value", () => {
    render(
      <Slider
        aria-label="Range"
        value={[20, 80]}
        min={0}
        max={100}
        step={1}
        onValueChange={() => undefined}
      />,
    );

    expect(document.querySelectorAll('input[type="range"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="slider-thumb"]')).toHaveLength(2);
  });
});
