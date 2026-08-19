/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  scrollToPosition: vi.fn(),
  interrupt: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("motion/react", () => ({ useReducedMotion: () => false }));
vi.mock("@/lib/scroll/scroll-region", () => ({
  createScrollRegionController: () => ({
    element: document.createElement("div"),
    scrollToPosition: state.scrollToPosition,
    scrollToElement: vi.fn(),
    interrupt: state.interrupt,
    destroy: state.destroy,
  }),
}));

import { useScrollRegion } from "./use-scroll-region";

describe("useScrollRegion", () => {
  it("creates only after both roots exist and destroys on cleanup", () => {
    const { result, unmount } = renderHook(() => useScrollRegion());
    const viewport = document.createElement("div");
    const content = document.createElement("div");
    act(() => result.current.setViewportElement(viewport));
    expect(state.scrollToPosition).not.toHaveBeenCalled();
    act(() => result.current.setContentElement(content));
    act(() => result.current.scrollToPosition(120, "smooth"));
    expect(state.scrollToPosition).toHaveBeenCalledWith(120, "smooth");
    unmount();
    expect(state.destroy).toHaveBeenCalled();
  });
});
