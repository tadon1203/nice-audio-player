import { describe, expect, it, vi } from "vitest";
import { ScrollMemory } from "./scroll-memory";

describe("ScrollMemory lists", () => {
  it("recalls 0 for an unseen path and the last offset otherwise", () => {
    const memory = new ScrollMemory();
    expect(memory.recallList("/library/never")).toBe(0);
    memory.rememberList("/library/albums", 120);
    memory.rememberList("/library/albums", 480);
    expect(memory.recallList("/library/albums")).toBe(480);
    expect(memory.recallList("/library/tracks")).toBe(0);
  });

  it("keeps each instance's offsets apart", () => {
    const first = new ScrollMemory();
    const second = new ScrollMemory();
    first.rememberList("/library/albums", 300);
    expect(second.recallList("/library/albums")).toBe(0);
  });
});

describe("ScrollMemory.detailSnapshot", () => {
  it("reads the offset when the history entry is left and writes it back when restored", () => {
    const memory = new ScrollMemory();
    let offset = 640;
    const write = vi.fn((next: number) => {
      offset = next;
    });
    const snapshot = memory.detailSnapshot(() => offset, write);

    expect(snapshot.capture()).toBe(640);
    snapshot.restore(90);
    expect(write).toHaveBeenCalledWith(90);
    expect(offset).toBe(90);
  });
});
