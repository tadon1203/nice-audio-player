import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { animate } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RETURN_TO_FOLLOW_MS, useLyricsScroll } from "./use-lyrics-scroll";

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  animate: vi.fn(() => ({ stop: () => undefined })),
  useReducedMotion: () => false,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINE_COUNT = 40;
const LINE_HEIGHT = 40;

type Scroll = ReturnType<typeof useLyricsScroll>;

let host: HTMLElement;
let root: Root;
let latest: Scroll;
let scrollTops: number[];

function Harness({ index }: { index: number }) {
  const scroll = useLyricsScroll(index);
  latest = scroll;
  return (
    <div
      ref={(element) => {
        scroll.containerRef.current = element;
        if (element === null) return;
        Object.defineProperty(element, "clientHeight", { configurable: true, value: 400 });
        Object.defineProperty(element, "scrollHeight", {
          configurable: true,
          value: LINE_COUNT * LINE_HEIGHT,
        });
        Object.defineProperty(element, "scrollTop", {
          configurable: true,
          get: () => scrollTops.at(-1) ?? 0,
          set: (value: number) => scrollTops.push(value),
        });
      }}
      {...scroll.containerHandlers}
    >
      {Array.from({ length: LINE_COUNT }, (_, line) => (
        <div
          key={line}
          ref={(element) => {
            if (element !== null) {
              Object.defineProperty(element, "offsetTop", {
                configurable: true,
                value: line * LINE_HEIGHT,
              });
              Object.defineProperty(element, "offsetHeight", {
                configurable: true,
                value: LINE_HEIGHT,
              });
            }
            scroll.registerLine(line, element);
          }}
        />
      ))}
    </div>
  );
}

async function show(index: number) {
  await act(async () => root.render(<Harness index={index} />));
}

/** How many times the list was animated to a position (as opposed to set at once). */
function animatedScrolls() {
  return vi.mocked(animate).mock.calls.filter(([from]) => typeof from === "number").length;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  vi.mocked(animate).mockClear();
  scrollTops = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("useLyricsScroll", () => {
  it("sets the position at once when it mounts", async () => {
    await show(10);
    expect(animatedScrolls()).toBe(0);
    // Line 10's centre (10 * 40 + 20) at 40% of 400px.
    expect(scrollTops.at(-1)).toBe(10 * LINE_HEIGHT + LINE_HEIGHT / 2 - 160);
  });

  it("animates a step to the next line", async () => {
    await show(10);
    await show(11);
    expect(animatedScrolls()).toBe(1);
  });

  it("sets a large seek at once and fades the list in", async () => {
    await show(2);
    await show(7);
    expect(animatedScrolls()).toBe(0);
    expect(scrollTops.at(-1)).toBe(7 * LINE_HEIGHT + LINE_HEIGHT / 2 - 160);
    expect(vi.mocked(animate).mock.calls.some(([target]) => target instanceof HTMLElement)).toBe(
      true,
    );
  });

  it("animates a seek of a few lines", async () => {
    await show(10);
    await show(8);
    expect(animatedScrolls()).toBe(1);
  });

  it("returns to follow on a seek", async () => {
    await show(2);
    await act(async () => latest.containerHandlers.onWheel());
    expect(latest.mode).toBe("free");
    await show(30);
    expect(latest.mode).toBe("follow");
  });

  it("returns to follow at a step once 3s have passed since the last interaction", async () => {
    await show(2);
    await act(async () => latest.containerHandlers.onWheel());
    vi.setSystemTime(Date.now() + RETURN_TO_FOLLOW_MS);
    await show(3);
    expect(latest.mode).toBe("follow");
  });

  it("stays free at a step within 3s of the last interaction", async () => {
    await show(2);
    await act(async () => latest.containerHandlers.onWheel());
    vi.setSystemTime(Date.now() + RETURN_TO_FOLLOW_MS - 1);
    await show(3);
    expect(latest.mode).toBe("free");
  });
});
