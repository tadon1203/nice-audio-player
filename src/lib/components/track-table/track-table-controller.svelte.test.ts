import { type TrackId } from "#lib/native/bindings";
import type { App } from "#lib/app/app.svelte";
import { describe, expect, it, vi, type Mock } from "vitest";
import { TrackTableController } from "./track-table-controller.svelte";
import type { TrackTableRow } from "./track-columns";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

const row: TrackTableRow = {
  id: 7 as TrackId,
  title: "Song",
  artist: "Artist",
  durationMs: 65_000,
  state: "playable",
};

/** A fake of the App the controller reads: runs actions at once and records the backend calls. */
function fakeApp(
  status: "stopped" | "paused" = "stopped",
  activeTrackId: TrackId | null = null,
): {
  app: App;
  calls: Record<"enqueue" | "pause" | "resume" | "reveal", Mock>;
} {
  const calls = {
    enqueue: vi.fn(async (_id: TrackId, _next: boolean) => {}),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    reveal: vi.fn(async (_id: TrackId) => {}),
  };
  const app = {
    actions: { run: (action: () => Promise<unknown>): void => void action() },
    player: {
      activeTrackId,
      status,
      enqueue: calls.enqueue,
      pause: calls.pause,
      resume: calls.resume,
    },
    library: { reveal: calls.reveal },
  } as unknown as App;
  return { app, calls };
}

/** A table row with one cell, as the browser would hand it to the handlers. */
function mountRow(): {
  tr: HTMLTableRowElement;
  cell: HTMLTableCellElement;
  button: HTMLButtonElement;
} {
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  const tr = document.createElement("tr");
  tr.dataset.rowId = String(row.id);
  const cell = document.createElement("td");
  const button = document.createElement("button");
  cell.append(button);
  tr.append(cell);
  tbody.append(tr);
  table.append(tbody);
  document.body.append(table);
  return { tr, cell, button };
}

describe("TrackTableController", () => {
  it("plays a row on click, and leaves clicks on its controls to them", () => {
    const { app } = fakeApp();
    const play = vi.fn();
    const controller = new TrackTableController(app, () => [row], play);
    const { tr, button } = mountRow();

    controller.onRowClick(new MouseEvent("click", { bubbles: true }) as never, row.id);
    expect(play).toHaveBeenCalledWith(row.id);

    play.mockClear();
    const clickOnButton = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(clickOnButton, "target", { value: button });
    controller.onRowClick(clickOnButton, row.id);
    expect(play).not.toHaveBeenCalled();
    tr.remove();
  });

  it("resumes a paused row on click instead of playing it", () => {
    const { app, calls } = fakeApp("paused", row.id);
    const play = vi.fn();
    const controller = new TrackTableController(app, () => [row], play);
    const event = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(event, "target", { value: document.createElement("span") });
    controller.onRowClick(event, row.id);
    expect(play).not.toHaveBeenCalled();
    expect(calls.resume).toHaveBeenCalledOnce();
  });

  it("resolves the context-menu row from the right-clicked row", () => {
    const { app } = fakeApp();
    const controller = new TrackTableController(app, () => [row], vi.fn());
    const { tr, cell } = mountRow();
    expect(controller.menuTrack).toBeNull();

    const event = new MouseEvent("contextmenu", { bubbles: true });
    Object.defineProperty(event, "target", { value: cell });
    controller.onContextMenu(event);
    // The menu row is held as state, which wraps the object: compare its contents.
    expect(controller.menuTrack).toEqual(row);
    tr.remove();
  });

  it("calls reveal for the menu row in Show in Explorer", () => {
    const { app, calls } = fakeApp();
    const controller = new TrackTableController(app, () => [row], vi.fn());
    const { tr, cell } = mountRow();
    const event = new MouseEvent("contextmenu", { bubbles: true });
    Object.defineProperty(event, "target", { value: cell });
    controller.onContextMenu(event);

    controller.reveal();
    expect(calls.reveal).toHaveBeenCalledWith(row.id);
    tr.remove();
  });

  it("queues the menu row next or last", () => {
    const { app, calls } = fakeApp();
    const controller = new TrackTableController(app, () => [row], vi.fn());
    const { tr, cell } = mountRow();
    const event = new MouseEvent("contextmenu", { bubbles: true });
    Object.defineProperty(event, "target", { value: cell });
    controller.onContextMenu(event);

    controller.playNext();
    controller.addToQueue();
    expect(calls.enqueue).toHaveBeenNthCalledWith(1, row.id, true);
    expect(calls.enqueue).toHaveBeenNthCalledWith(2, row.id, false);
    tr.remove();
  });
});
