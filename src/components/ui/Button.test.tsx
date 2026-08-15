/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("uses the neutral variant by default and preserves consumer attributes", () => {
    render(
      <Button type="button" className="consumer-class">
        Neutral action
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Neutral action" });
    expect(button).toHaveClass("button", "button--neutral", "consumer-class");
    expect(button).toHaveAttribute("type", "button");
  });

  it("uses filled styling and native disabled behavior", () => {
    render(
      <Button variant="filled" disabled>
        Filled action
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Filled action" });
    expect(button).toHaveClass("button--filled");
    expect(button).toBeDisabled();
  });

  it("calls the supplied click handler", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Action</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Action" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
