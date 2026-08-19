/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async () => {
  return {
    AnimatePresence: ({ children }: { children: import("react").ReactNode }) => <>{children}</>,
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...props}>{children}</div>
      ),
    },
    useIsPresent: () => true,
    useReducedMotion: () => false,
  };
});

import { ExclusiveRegion } from "./ExclusiveRegion";

describe("ExclusiveRegion", () => {
  it("renders one neutral active subtree without directional motion", () => {
    const { getByText } = render(
      <ExclusiveRegion activeKey="library">
        <p>Library</p>
      </ExclusiveRegion>,
    );
    expect(getByText("Library").closest(".exclusive-region__contents")).toHaveAttribute(
      "data-state",
      "present",
    );
  });
});
