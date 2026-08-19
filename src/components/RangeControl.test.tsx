/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const motionMocks = vi.hoisted(() => ({ useReducedMotion: vi.fn(() => false) }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: motionMocks.useReducedMotion };
});

import { RangeControl } from "./RangeControl";

describe("RangeControl", () => {
  afterEach(() => {
    cleanup();
    motionMocks.useReducedMotion.mockReturnValue(false);
  });
  it("keeps one native semantic slider and routes interaction events", () => {
    const onValueChange = vi.fn();
    const onInteractionStart = vi.fn();
    const onValueCommit = vi.fn();
    const onInteractionCancel = vi.fn();
    render(
      <RangeControl
        aria-label="Test range"
        aria-valuetext="50 percent"
        value={50}
        min={0}
        max={100}
        step={1}
        onValueChange={onValueChange}
        onInteractionStart={onInteractionStart}
        onValueCommit={onValueCommit}
        onInteractionCancel={onInteractionCancel}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Test range" });
    expect(slider).toHaveAttribute("aria-valuetext", "50 percent");
    expect(slider.parentElement?.querySelectorAll('input[type="range"]')).toHaveLength(1);
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "60" } });
    fireEvent.pointerUp(slider, { target: { value: "60" } });
    expect(onInteractionStart).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith(60);
    expect(onValueCommit).toHaveBeenCalledWith(60);
    fireEvent.pointerCancel(slider);
    expect(onInteractionCancel).toHaveBeenCalledOnce();
  });

  it.each(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"])(
    "commits supported key %s on release",
    (key) => {
      const onValueCommit = vi.fn();
      render(
        <RangeControl
          aria-label="Keyboard range"
          value={50}
          min={0}
          max={100}
          step={1}
          onValueChange={vi.fn()}
          onValueCommit={onValueCommit}
        />,
      );
      fireEvent.keyUp(screen.getByRole("slider", { name: "Keyboard range" }), { key });
      expect(onValueCommit).toHaveBeenCalledOnce();
    },
  );

  it("does not commit unsupported keys and handles degenerate ranges", () => {
    const onValueCommit = vi.fn();
    const { container } = render(
      <RangeControl
        aria-label="Degenerate range"
        value={1}
        min={1}
        max={1}
        step={1}
        onValueChange={vi.fn()}
        onValueCommit={onValueCommit}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Degenerate range" });
    fireEvent.keyUp(slider, { key: "Tab" });
    expect(onValueCommit).not.toHaveBeenCalled();
    expect(container.querySelector(".range-control")).toHaveAttribute("data-progress", "0");
  });

  it("uses immediate position motion while pointer dragging", () => {
    render(
      <RangeControl
        aria-label="Motion range"
        value={50}
        min={0}
        max={100}
        step={1}
        onValueChange={vi.fn()}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Motion range" });
    const control = slider.parentElement!;
    expect(control).toHaveAttribute("data-position-motion", "settled");
    expect(control.querySelector(".range-control__fill-position")).toHaveAttribute(
      "data-progress",
      "0.5",
    );
    expect(control.querySelector(".range-control__thumb-position")).toHaveAttribute(
      "data-progress",
      "0.5",
    );
    fireEvent.pointerDown(slider);
    expect(control).toHaveAttribute("data-position-motion", "immediate");
    fireEvent.pointerUp(slider);
    expect(control).toHaveAttribute("data-position-motion", "settled");
  });

  it("returns keyboard manipulation to settled state on key release without losing focus", () => {
    render(
      <RangeControl
        aria-label="Keyboard motion range"
        value={50}
        min={0}
        max={100}
        step={1}
        onValueChange={vi.fn()}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Keyboard motion range" });
    const control = slider.parentElement!;
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(control).toHaveAttribute("data-position-motion", "immediate");
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(document.activeElement).toBe(slider);
    expect(control).toHaveAttribute("data-position-motion", "settled");
  });

  it("switches visual feedback through hover, active, and release states", () => {
    render(
      <RangeControl
        aria-label="Feedback range"
        value={50}
        min={0}
        max={100}
        step={1}
        onValueChange={vi.fn()}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Feedback range" });
    const control = slider.parentElement!;
    fireEvent.pointerEnter(slider);
    expect(control).toHaveAttribute("data-interaction-state", "hover");
    expect(control).toHaveClass("is-hovered");
    fireEvent.pointerDown(slider);
    expect(control).toHaveAttribute("data-interaction-state", "active");
    expect(control).toHaveClass("is-active");
    fireEvent.pointerUp(slider);
    expect(control).toHaveAttribute("data-interaction-state", "hover");
    expect(control).not.toHaveClass("is-active");
    fireEvent.pointerLeave(slider);
    expect(control).toHaveAttribute("data-interaction-state", "idle");
  });

  it("uses immediate position motion when reduced motion is active", () => {
    motionMocks.useReducedMotion.mockReturnValue(true);
    render(
      <RangeControl
        aria-label="Reduced range"
        value={50}
        min={0}
        max={100}
        step={1}
        onValueChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("slider", { name: "Reduced range" }).parentElement).toHaveAttribute(
      "data-position-motion",
      "immediate",
    );
  });
});
