import { describe, expect, it } from "vitest";
import { PlaybackError, SupersededError } from "#lib/native";
import { NoticeCenter } from "./notice-center.svelte";
import { UserActionRunner } from "./user-action-runner.svelte";

/** Waits until the runner has settled its action. */
const settled = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 0));

describe("UserActionRunner", () => {
  it("shows nothing for a superseded command", async () => {
    const notices = new NoticeCenter();
    const runner = new UserActionRunner(notices);
    runner.run(() => Promise.reject(new SupersededError({ code: "superseded" })));
    await settled();
    expect(notices.at("dock")).toBeNull();
  });

  it("shows one error notice at the place it was run for", async () => {
    const notices = new NoticeCenter();
    const runner = new UserActionRunner(notices);
    runner.run(() => Promise.reject(new PlaybackError({ code: "queueBusy" })), "settings");
    await settled();
    expect(notices.at("settings")).toEqual({
      kind: "error",
      message: "The playback queue is busy. Try again.",
    });
    expect(notices.at("dock")).toBeNull();
  });

  it("reports a place as busy from the run until its action settles", async () => {
    const runner = new UserActionRunner(new NoticeCenter());
    runner.run(() => Promise.resolve(), "library");
    expect(runner.isRunning("library")).toBe(true);
    expect(runner.isRunning("dock")).toBe(false);
    await settled();
    expect(runner.isRunning("library")).toBe(false);
  });

  it("clears the error at its place before the action runs", async () => {
    const notices = new NoticeCenter();
    const runner = new UserActionRunner(notices);
    notices.showError("dock", "Old failure");
    let seenDuringAction: unknown = null;
    runner.run(() => {
      seenDuringAction = notices.at("dock");
      return Promise.resolve();
    });
    expect(seenDuringAction).toBeNull();
    await settled();
    expect(notices.at("dock")).toBeNull();
  });
});
