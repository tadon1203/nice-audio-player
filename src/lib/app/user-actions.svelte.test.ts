import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notices, UserActions } from "./user-actions.svelte";

describe("Notices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one skip notice between consecutive skips", () => {
    const notices = new Notices();
    notices.noteSkipped("First");
    notices.noteSkipped("Second");
    notices.noteSkipped(null);
    expect(notices.at("dock")).toEqual({
      kind: "skipped",
      message: "Couldn't play First and 2 more, skipped",
    });
  });

  it("clears the skip notice after its time", () => {
    const notices = new Notices();
    notices.noteSkipped("First");
    vi.advanceTimersByTime(6_000);
    expect(notices.at("dock")).toBeNull();
  });

  it("clears the undo offer after its time", () => {
    const notices = new Notices();
    notices.offerUndo("Upcoming cleared");
    expect(notices.at("dock")).toEqual({ kind: "undo", message: "Upcoming cleared" });
    vi.advanceTimersByTime(6_000);
    expect(notices.at("dock")).toBeNull();
  });

  it("shows an error before the undo offer and the skip notice in the Dock", () => {
    const notices = new Notices();
    notices.noteSkipped("First");
    notices.offerUndo("Upcoming cleared");
    notices.showError("dock", "Failed");
    expect(notices.at("dock")).toEqual({ kind: "error", message: "Failed" });
    notices.dismissError("dock");
    expect(notices.at("dock")).toEqual({ kind: "undo", message: "Upcoming cleared" });
  });

  it("keeps the error of each place apart, and shows only errors in Settings", () => {
    const notices = new Notices();
    notices.noteSkipped("First");
    notices.showError("settings", "Not saved");
    expect(notices.at("settings")).toEqual({ kind: "error", message: "Not saved" });
    expect(notices.at("dock")).toEqual({
      kind: "skipped",
      message: "Couldn't play First, skipped",
    });
    notices.dismissError("dock");
    expect(notices.at("settings")).toEqual({ kind: "error", message: "Not saved" });
  });

  it("dismisses one kind of notice at a time", () => {
    const notices = new Notices();
    notices.offerUndo("Upcoming cleared");
    notices.noteSkipped("First");
    notices.dismissSkipped();
    expect(notices.at("dock")).toEqual({ kind: "undo", message: "Upcoming cleared" });
  });
});

describe("UserActions", () => {
  /** Waits until the actions have settled. */
  const settled = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 0));

  it("shows one error notice at the place it was run for", async () => {
    const notices = new Notices();
    const actions = new UserActions(notices);
    actions.run(
      () => Promise.resolve({ ok: false, error: { code: "duplicateDirectory" } }),
      "settings",
    );
    await settled();
    expect(notices.at("settings")).toEqual({
      kind: "error",
      message: "That directory is already in the library.",
    });
    expect(notices.at("dock")).toBeNull();
  });

  it("shows nothing for a successful Result", async () => {
    const notices = new Notices();
    const actions = new UserActions(notices);
    actions.run(() => Promise.resolve({ ok: true, value: null }), "dock");
    await settled();
    expect(notices.at("dock")).toBeNull();
  });

  it("shows the general text for an action that throws, which is not a Backend failure", async () => {
    const notices = new Notices();
    const actions = new UserActions(notices);
    actions.run(() => Promise.reject(new Error("clipboard denied")), "dock");
    await settled();
    expect(notices.at("dock")).toEqual({
      kind: "error",
      message: "Something went wrong. Try again.",
    });
  });

  it("reports a place as busy from the run until its action settles", async () => {
    const actions = new UserActions(new Notices());
    actions.run(() => Promise.resolve(), "library");
    expect(actions.isRunning("library")).toBe(true);
    expect(actions.isRunning("dock")).toBe(false);
    await settled();
    expect(actions.isRunning("library")).toBe(false);
  });

  it("clears the error at its place before the action runs", async () => {
    const notices = new Notices();
    const actions = new UserActions(notices);
    notices.showError("dock", "Old failure");
    let seenDuringAction: unknown = null;
    actions.run(() => {
      seenDuringAction = notices.at("dock");
      return Promise.resolve();
    });
    expect(seenDuringAction).toBeNull();
    await settled();
    expect(notices.at("dock")).toBeNull();
  });
});
