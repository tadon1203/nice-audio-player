import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoticeCenter } from "./notice-center.svelte";

describe("NoticeCenter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one skip notice between consecutive skips", () => {
    const notices = new NoticeCenter();
    notices.noteSkipped("First");
    notices.noteSkipped("Second");
    notices.noteSkipped(null);
    expect(notices.at("dock")).toEqual({
      kind: "skipped",
      message: "Couldn't play First and 2 more, skipped",
    });
  });

  it("clears the skip notice after its time", () => {
    const notices = new NoticeCenter();
    notices.noteSkipped("First");
    vi.advanceTimersByTime(6_000);
    expect(notices.at("dock")).toBeNull();
  });

  it("clears the undo offer after its time", () => {
    const notices = new NoticeCenter();
    notices.offerUndo("Upcoming cleared");
    expect(notices.at("dock")).toEqual({ kind: "undo", message: "Upcoming cleared" });
    vi.advanceTimersByTime(6_000);
    expect(notices.at("dock")).toBeNull();
  });

  it("shows an error before the undo offer and the skip notice in the Dock", () => {
    const notices = new NoticeCenter();
    notices.noteSkipped("First");
    notices.offerUndo("Upcoming cleared");
    notices.showError("dock", "Failed");
    expect(notices.at("dock")).toEqual({ kind: "error", message: "Failed" });
    notices.clearError("dock");
    expect(notices.at("dock")).toEqual({ kind: "undo", message: "Upcoming cleared" });
  });

  it("keeps the error of each place apart, and shows only errors in Settings", () => {
    const notices = new NoticeCenter();
    notices.noteSkipped("First");
    notices.showError("settings", "Not saved");
    expect(notices.at("settings")).toEqual({ kind: "error", message: "Not saved" });
    expect(notices.at("dock")).toEqual({
      kind: "skipped",
      message: "Couldn't play First, skipped",
    });
    notices.dismiss("dock", "error");
    expect(notices.at("settings")).toEqual({ kind: "error", message: "Not saved" });
  });

  it("dismisses one kind of notice at a time", () => {
    const notices = new NoticeCenter();
    notices.offerUndo("Upcoming cleared");
    notices.noteSkipped("First");
    notices.dismiss("dock", "skipped");
    expect(notices.at("dock")).toEqual({ kind: "undo", message: "Upcoming cleared" });
  });
});
