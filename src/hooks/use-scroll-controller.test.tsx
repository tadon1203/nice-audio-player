/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  active: false,
  programmatic: false,
  finalize: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("motion/react", () => ({ useReducedMotion: () => false }));
vi.mock("@/lib/scroll/animate-scroll", () => ({
  createScrollAnimationController: () => ({
    scrollTo: () => {
      state.programmatic = true;
      state.active = true;
    },
    cancel: () => {
      state.cancel();
      state.programmatic = false;
      state.active = false;
    },
    finalizeProgrammaticDelivery: () => {
      state.finalize();
      state.programmatic = false;
    },
    get active() {
      return state.active;
    },
    get programmatic() {
      return state.programmatic;
    },
  }),
}));

import { useScrollController } from "./use-scroll-controller";

describe("useScrollController", () => {
  it("keeps the final programmatic scroll delivery out of user detachment", () => {
    const viewport = document.createElement("div");
    const onUserScroll = vi.fn();
    const { result } = renderHook(() => useScrollController(viewport, onUserScroll));

    act(() => result.current.scrollToPosition(120, "smooth"));
    state.active = false;
    act(() => viewport.dispatchEvent(new Event("scroll")));

    expect(onUserScroll).not.toHaveBeenCalled();
    expect(state.finalize).toHaveBeenCalledOnce();
  });

  it("detaches only after a user gesture is followed by native scrolling", () => {
    const viewport = document.createElement("div");
    const onUserScroll = vi.fn();
    renderHook(() => useScrollController(viewport, onUserScroll));

    act(() => viewport.dispatchEvent(new WheelEvent("wheel")));
    act(() => viewport.dispatchEvent(new Event("scroll")));

    expect(onUserScroll).toHaveBeenCalledOnce();
  });
});
