/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const motionMocks = vi.hoisted(() => ({ useReducedMotion: vi.fn(() => false) }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: motionMocks.useReducedMotion };
});

import { PlayPauseIcon, VolumeIcon } from "./icons";

describe("project-owned icons", () => {
  afterEach(() => motionMocks.useReducedMotion.mockReturnValue(false));
  it("keeps decorative SVGs out of the accessibility tree", () => {
    const { container } = render(<PlayPauseIcon playing={false} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("builds Play/Pause from two compatible morph paths", () => {
    const { container, unmount } = render(<PlayPauseIcon playing={false} />);
    expect(container.querySelectorAll("svg > path")).toHaveLength(2);
    expect(container.querySelector("svg > path")?.getAttribute("d")).toBe("M8 5L18 12L8 19L8 5Z");
    unmount();
    const playing = render(<PlayPauseIcon playing />).container;
    expect(playing.querySelectorAll('svg > path[d="M7 5L10 5L10 19L7 19Z"]')).toHaveLength(1);
    expect(playing.querySelectorAll('svg > path[d="M14 5L17 5L17 19L14 19Z"]')).toHaveLength(1);
  });

  it("uses completed icon groups with opacity crossfade for reduced motion", () => {
    motionMocks.useReducedMotion.mockReturnValue(true);
    const { container } = render(<PlayPauseIcon playing={false} />);
    expect(container.querySelectorAll("svg > g")).toHaveLength(1);
    expect(container.querySelectorAll("svg > g > path")).toHaveLength(2);
  });

  it("keeps audible waves and the cancellation slash as independent Volume primitives", () => {
    const { container, unmount } = render(<VolumeIcon state="high" />);
    expect(container.querySelectorAll("svg path")).toHaveLength(4);
    expect(container.querySelectorAll('path[d="M4.5 4.5 C9.5 9.5 15 15 20.5 20.5"]')).toHaveLength(
      0,
    );

    unmount();
    const { container: silentContainer } = render(<VolumeIcon state="silent" />);
    expect(
      silentContainer.querySelectorAll('path[d="M4.5 4.5 C9.5 9.5 15 15 20.5 20.5"]'),
    ).toHaveLength(1);
    expect(silentContainer.querySelectorAll('path[d="M16 12 C16 12 16 12 16 12"]')).toHaveLength(1);
  });

  it("exposes a complete silent icon state with one long cancellation slash", () => {
    const { container } = render(<VolumeIcon state="silent" />);
    const state = container.querySelector('[data-volume-icon-state="silent"]');
    expect(state).toBeInTheDocument();
    expect(state).toHaveAttribute("data-reduced-motion", "false");
    expect(state?.querySelectorAll('path[d="M4.5 4.5 C9.5 9.5 15 15 20.5 20.5"]')).toHaveLength(1);
  });

  it("uses a reduced-motion final-state group instead of path morphing", () => {
    motionMocks.useReducedMotion.mockReturnValue(true);
    const { container } = render(<VolumeIcon state="silent" />);
    const state = container.querySelector('[data-volume-icon-state="silent"]');
    expect(state).toHaveAttribute("data-reduced-motion", "true");
    expect(state?.querySelectorAll("g path")).toHaveLength(3);
    expect(state?.querySelectorAll('path[d="M4.5 4.5 C9.5 9.5 15 15 20.5 20.5"]')).toHaveLength(1);
  });
});
