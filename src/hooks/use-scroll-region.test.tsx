/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useScrollRegion } from "./use-scroll-region";

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock("./use-reduced-motion-preference", () => ({
  useReducedMotionPreference: () => reducedMotion.value,
}));

function viewport() {
  const element = document.createElement("div");
  Object.defineProperties(element, {
    scrollHeight: { value: 1000, configurable: true },
    clientHeight: { value: 100, configurable: true },
  });
  const scrollTo = vi.fn((options: ScrollToOptions) =>
    Object.defineProperty(element, "scrollTop", { value: options.top ?? 0, configurable: true }),
  );
  element.scrollTo = scrollTo as typeof element.scrollTo;
  return element;
}

describe("useScrollRegion", () => {
  it("starts with a viewport only and applies pending requests", () => {
    const { result } = renderHook(() => useScrollRegion());
    act(() => result.current.scrollToPosition(120));
    const element = viewport();
    act(() => result.current.setViewportElement(element));
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 120, behavior: "auto" });
  });

  it("clamps instant and requests native smooth behavior", () => {
    const { result } = renderHook(() => useScrollRegion());
    const element = viewport();
    act(() => result.current.setViewportElement(element));
    act(() => result.current.scrollToPosition(2000, "instant"));
    act(() => result.current.scrollToPosition(120, "smooth"));
    expect(element.scrollTo).toHaveBeenNthCalledWith(1, { top: 900, behavior: "auto" });
    expect(element.scrollTo).toHaveBeenNthCalledWith(2, { top: 120, behavior: "smooth" });
  });

  it("converts smooth movement to instant under reduced motion", () => {
    reducedMotion.value = true;
    const { result } = renderHook(() => useScrollRegion());
    const element = viewport();
    act(() => result.current.setViewportElement(element));
    act(() => result.current.scrollToPosition(120, "smooth"));
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 120, behavior: "auto" });
  });

  it("restores a retained position when the viewport mounts", () => {
    const set = vi.fn();
    const { result } = renderHook(() =>
      useScrollRegion(undefined, { key: "root", registry: { get: () => 240, set } }),
    );
    const element = viewport();
    act(() => result.current.setViewportElement(element));
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 240, behavior: "auto" });
  });

  it("lets a pending command take precedence over retained restoration", () => {
    const { result } = renderHook(() =>
      useScrollRegion(undefined, { key: "root", registry: { get: () => 240, set: vi.fn() } }),
    );
    act(() => result.current.scrollToPosition(120));
    const element = viewport();
    act(() => result.current.setViewportElement(element));
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 120, behavior: "auto" });
  });

  it("persists native positions and reports only positive input intent", () => {
    const set = vi.fn();
    const onUserScroll = vi.fn();
    const { result, unmount } = renderHook(() =>
      useScrollRegion(onUserScroll, { key: "root", registry: { get: () => undefined, set } }),
    );
    const element = viewport();
    act(() => result.current.setViewportElement(element));
    Object.defineProperty(element, "scrollTop", { value: 80, configurable: true });
    element.dispatchEvent(new Event("scroll"));
    expect(set).toHaveBeenCalledWith("root", 80);
    expect(onUserScroll).not.toHaveBeenCalled();
    element.dispatchEvent(new WheelEvent("wheel", { deltaY: 10 }));
    element.dispatchEvent(new Event("scroll"));
    expect(onUserScroll).toHaveBeenCalledTimes(1);
    unmount();
    expect(set).toHaveBeenLastCalledWith("root", 80);
  });

  it("does not classify interactive pointer activation as scrolling", () => {
    const onUserScroll = vi.fn();
    const { result } = renderHook(() => useScrollRegion(onUserScroll));
    const element = viewport();
    const button = document.createElement("button");
    element.append(button);
    act(() => result.current.setViewportElement(element));
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    element.dispatchEvent(new Event("scroll"));
    expect(onUserScroll).not.toHaveBeenCalled();
  });

  it("classifies touch, scroll keys, and pointer-driven viewport scrolling as user intent", () => {
    const onUserScroll = vi.fn();
    const { result } = renderHook(() => useScrollRegion(onUserScroll));
    const element = viewport();
    act(() => result.current.setViewportElement(element));

    element.dispatchEvent(new TouchEvent("touchmove", { bubbles: true }));
    element.dispatchEvent(new Event("scroll"));
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    element.dispatchEvent(new Event("scroll"));
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    element.dispatchEvent(new Event("scroll"));

    expect(onUserScroll).toHaveBeenCalledTimes(3);
  });

  it("uses nearest shared geometry for element requests", () => {
    const { result } = renderHook(() => useScrollRegion());
    const element = viewport();
    const target = document.createElement("div");
    Object.defineProperty(target, "offsetTop", { value: 300 });
    Object.defineProperty(target, "offsetHeight", { value: 40 });
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ top: 0 } as DOMRect);
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: 300, height: 40 } as DOMRect);
    element.append(target);
    act(() => result.current.setViewportElement(element));
    act(() => result.current.scrollToElement(target, "center", "instant"));
    expect(element.scrollTo).toHaveBeenCalledWith({ top: 270, behavior: "auto" });
  });
});
