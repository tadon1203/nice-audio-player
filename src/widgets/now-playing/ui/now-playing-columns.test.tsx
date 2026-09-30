import { act } from "react";
import { createRoot } from "react-dom/client";
import { motionValue } from "motion/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackQueueItem } from "@/shared/ipc";
import { KineticText } from "@/shared/ui/kinetic-text";
import { IntervalLine } from "./lyrics-panel";
import { QueueList } from "./queue-column";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (id: string, title: string): PlaybackQueueItem => ({
  id,
  trackId: id,
  title,
  artist: "Artist",
  album: null,
  artwork: null,
  durationMs: 60_000,
});

const history = [item("a", "One")];
const current = item("b", "Two");
const upcoming = [item("c", "Three"), item("d", "Four")];

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

let host: HTMLElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  await act(async () => createRoot(host!).render(node));
  return host;
}

function queue(props: Partial<React.ComponentProps<typeof QueueList>> = {}) {
  return (
    <QueueList
      variant="full"
      history={history}
      current={current}
      upcoming={upcoming}
      upcomingCount={upcoming.length}
      onPlay={() => undefined}
      onOpenQueue={() => undefined}
      {...props}
    />
  );
}

describe("QueueList", () => {
  it("marks only the playing track as current, in queue order", async () => {
    const el = await render(queue());
    const current = el.querySelectorAll('[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain("Two");
    const titles = [...el.querySelectorAll('[role="listitem"]')].map((row) => row.textContent);
    expect(titles.map((text) => text?.replace(/Artist.*/, "").replace(/^\d+/, ""))).toEqual([
      "One",
      "Two",
      "Three",
      "Four",
    ]);
  });

  it("plays an upcoming track when its row is clicked", async () => {
    const onPlay = vi.fn();
    const el = await render(queue({ onPlay }));
    await act(async () =>
      el.querySelector<HTMLButtonElement>('[aria-label="Play Three"]')!.click(),
    );
    expect(onPlay).toHaveBeenCalledWith("c");
  });

  it("disables the past and the current rows", async () => {
    const el = await render(queue());
    expect(el.querySelector<HTMLButtonElement>('[aria-label="Play One"]')!.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('[aria-label="Play Two"]')!.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('[aria-label="Play Three"]')!.disabled).toBe(false);
  });

  it("numbers the upcoming tracks by how far away they are", async () => {
    const el = await render(queue());
    const gutter = el.querySelector('[aria-label="Play Four"] > span');
    expect(gutter?.textContent).toBe("2");
  });

  it("opens the queue from the count of what is not shown", async () => {
    const onOpenQueue = vi.fn();
    const el = await render(queue({ upcomingCount: 12, onOpenQueue }));
    const more = [...el.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("10 more in the queue"),
    );
    expect(more).toBeDefined();
    await act(async () => more!.click());
    expect(onOpenQueue).toHaveBeenCalled();
  });

  it("says so when nothing else is queued", async () => {
    const el = await render(queue({ history: [], upcoming: [], upcomingCount: 0 }));
    expect(el.textContent).toContain("Nothing else in the queue");
  });

  it("shows only the upcoming tracks in the rail", async () => {
    const el = await render(queue({ variant: "rail" }));
    expect(el.textContent).toContain("Up next");
    expect(el.textContent).not.toContain("One");
    expect(el.textContent).not.toContain("Two");
    expect(el.querySelectorAll('[role="listitem"]')).toHaveLength(2);
  });
});

describe("KineticText", () => {
  it("draws the text once", async () => {
    const el = await render(<KineticText text="Motion Picture Soundtrack" direction={1} />);
    expect(el.textContent).toBe("Motion Picture Soundtrack");
  });
});

describe("IntervalLine", () => {
  it("names the instrumental and its length", async () => {
    const el = await render(
      <IntervalLine startMs={10_000} endMs={61_000} isCurrent={false} position={motionValue(0)} />,
    );
    expect(el.querySelector('[data-slot="lyrics-interval"]')?.getAttribute("aria-label")).toBe(
      "Instrumental, 0:51",
    );
  });
});
