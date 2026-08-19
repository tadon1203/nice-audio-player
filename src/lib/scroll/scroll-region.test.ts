/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";

const lenisState = vi.hoisted(() => ({
  instances: [] as Array<{
    options: Record<string, unknown>;
    scrollTo: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("lenis", () => ({
  default: class MockLenis {
    options: Record<string, unknown>;
    scrollTo = vi.fn();
    stop = vi.fn();
    start = vi.fn();
    destroy = vi.fn();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      lenisState.instances.push(this);
    }
  },
}));
vi.mock("./frame", () => ({ registerLenis: () => vi.fn() }));

import { createScrollRegionController } from "./scroll-region";

function region() {
  const viewport = document.createElement("div");
  const content = document.createElement("div");
  viewport.append(content);
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 500 },
  });
  return { viewport, content };
}

describe("createScrollRegionController", () => {
  it("uses the explicit stable content element rather than inferring a child", () => {
    const { viewport, content } = region();
    createScrollRegionController(viewport, content);
    expect(lenisState.instances[lenisState.instances.length - 1]?.options.content).toBe(content);
  });

  it("lets Lenis-owned wheel input replace programmatic travel without stopping that input", () => {
    const { viewport, content } = region();
    const onUserScroll = vi.fn();
    const controller = createScrollRegionController(viewport, content, onUserScroll);
    controller.scrollToPosition(300, "smooth");
    const instance = lenisState.instances[lenisState.instances.length - 1]!;
    const virtualScroll = instance.options.virtualScroll as (data: {
      deltaY: number;
      event: WheelEvent;
    }) => boolean;

    expect(virtualScroll({ deltaY: 1, event: new WheelEvent("wheel") })).toBe(true);
    expect(instance.stop).not.toHaveBeenCalled();
    viewport.scrollTop = 42;
    viewport.dispatchEvent(new Event("scroll"));
    viewport.dispatchEvent(new Event("scroll"));

    expect(onUserScroll).toHaveBeenCalledOnce();
  });

  it("stops programmatic travel before browser-directed pointer scrolling", () => {
    const { viewport, content } = region();
    const controller = createScrollRegionController(viewport, content);
    controller.scrollToPosition(300, "smooth");

    viewport.dispatchEvent(new Event("pointerdown"));

    const instance = lenisState.instances[lenisState.instances.length - 1]!;
    expect(instance.stop).toHaveBeenCalledOnce();
    expect(instance.start).toHaveBeenCalledOnce();
  });

  it("interrupts application travel for native touch intent", () => {
    const { viewport, content } = region();
    const controller = createScrollRegionController(viewport, content);
    controller.scrollToPosition(300, "smooth");

    viewport.dispatchEvent(new Event("touchstart"));

    const instance = lenisState.instances[lenisState.instances.length - 1]!;
    expect(instance.stop).toHaveBeenCalledOnce();
    expect(instance.start).toHaveBeenCalledOnce();
  });

  it("consumes the delayed delivery of an instant programmatic position", () => {
    const { viewport, content } = region();
    const onUserScroll = vi.fn();
    const controller = createScrollRegionController(viewport, content, onUserScroll);
    controller.scrollToPosition(120, "instant");

    viewport.scrollTop = 120;
    viewport.dispatchEvent(new Event("scroll"));
    expect(onUserScroll).not.toHaveBeenCalled();

    const instance = lenisState.instances[lenisState.instances.length - 1]!;
    const virtualScroll = instance.options.virtualScroll as (data: {
      deltaY: number;
      event: WheelEvent;
    }) => boolean;
    virtualScroll({ deltaY: 1, event: new WheelEvent("wheel") });
    viewport.scrollTop = 121;
    viewport.dispatchEvent(new Event("scroll"));
    expect(onUserScroll).toHaveBeenCalledOnce();
  });

  it("makes wheel and semantic smooth requests immediate under reduced motion", () => {
    const { viewport, content } = region();
    const controller = createScrollRegionController(viewport, content, undefined, true);
    controller.scrollToPosition(120, "smooth");
    const instance = lenisState.instances[lenisState.instances.length - 1]!;
    expect(instance.options.smoothWheel).toBe(false);
    expect(instance.scrollTo).toHaveBeenCalledWith(
      120,
      expect.objectContaining({ immediate: true }),
    );
  });

  it("does not let a superseded completion clear the current operation", () => {
    const { viewport, content } = region();
    const onUserScroll = vi.fn();
    const controller = createScrollRegionController(viewport, content, onUserScroll);
    controller.scrollToPosition(100, "smooth");
    const instance = lenisState.instances[lenisState.instances.length - 1]!;
    const firstComplete = instance.scrollTo.mock.calls[0]?.[1]?.onComplete as () => void;
    controller.scrollToPosition(200, "smooth");
    firstComplete();

    viewport.dispatchEvent(new Event("scroll"));
    expect(onUserScroll).not.toHaveBeenCalled();
  });
});
