/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContentTransition } from "./ContentTransition";
import {
  contentTransitionVariants,
  reducedContentTransitionVariants,
} from "./ContentTransitionVariants";

describe("ContentTransition", () => {
  afterEach(cleanup);

  it("renders the initial content in a dedicated overlap stage", () => {
    render(
      <ContentTransition contentKey="library">
        <h1>Library</h1>
      </ContentTransition>,
    );
    expect(screen.getByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(document.querySelector(".content-transition-stage")).toBeInTheDocument();
    expect(document.querySelector(".content-transition")).toHaveAttribute("data-motion");
  });

  it("accepts a destination key change without changing child semantics", () => {
    const { rerender } = render(
      <ContentTransition contentKey="library">
        <h1>Library</h1>
      </ContentTransition>,
    );
    rerender(
      <ContentTransition contentKey="settings">
        <h1>Settings</h1>
      </ContentTransition>,
    );
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  });

  it.each(["neutral", "forward", "backward"] as const)(
    "exposes the %s semantic direction",
    (direction) => {
      render(
        <ContentTransition contentKey={direction} direction={direction}>
          <h1>{direction}</h1>
        </ContentTransition>,
      );

      expect(document.querySelector(".content-transition")).toHaveAttribute(
        "data-motion-direction",
        direction,
      );
    },
  );

  it.each([
    ["forward", 12, -8],
    ["backward", -12, 8],
  ] as const)("uses the %s enter and exit offsets", (direction, enterX, exitX) => {
    expect(contentTransitionVariants.initial(direction)).toEqual({ opacity: 0, x: enterX });
    expect(contentTransitionVariants.exit(direction)).toEqual({ opacity: 0, x: exitX });
  });

  it("keeps neutral navigation opacity-only", () => {
    expect(contentTransitionVariants.initial("neutral")).toEqual({ opacity: 0 });
    expect(contentTransitionVariants.animate).toEqual({ opacity: 1, x: 0 });
    expect(contentTransitionVariants.exit("neutral")).toEqual({ opacity: 0 });
  });

  it("removes translation when reduced motion is active", () => {
    expect(reducedContentTransitionVariants).toEqual({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    });
  });
});
