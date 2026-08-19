/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  useReducedMotion: () => motionState.reduced,
  motion: {
    span: ({
      layoutId,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement> & {
      layoutId: string;
      transition: unknown;
    }) => <span data-layout-id={layoutId} {...props} />,
  },
}));

import { AlbumArtworkIdentity } from "./AlbumArtworkIdentity";

describe("AlbumArtworkIdentity", () => {
  afterEach(() => {
    cleanup();
    motionState.reduced = false;
  });

  it("uses one album-owned layout identity in normal motion", () => {
    render(
      <AlbumArtworkIdentity albumId="album-1" className="artwork">
        <span>Cover</span>
      </AlbumArtworkIdentity>,
    );

    expect(screen.getByText("Cover").parentElement).toHaveAttribute(
      "data-layout-id",
      "album-artwork:album-1",
    );
  });

  it("renders a static replacement under reduced motion", () => {
    motionState.reduced = true;
    render(
      <AlbumArtworkIdentity albumId="album-1" className="artwork">
        <span>Cover</span>
      </AlbumArtworkIdentity>,
    );

    expect(screen.getByText("Cover").parentElement).not.toHaveAttribute("data-layout-id");
  });
});
