/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackSnapshot } from "@/bindings";
import { VolumeControl } from "./VolumeControl";

const playback = (volume: number, muted: boolean): PlaybackSnapshot => ({
  status: "stopped",
  revision: 1,
  file: null,
  volume,
  muted,
  outputSelection: { kind: "systemDefault" },
  canGoPrevious: false,
  canGoNext: false,
});

const base = {
  isPlaybackAvailable: true,
  isVolumeUpdatePending: false,
  isMutePending: false,
  onValueChange: vi.fn(),
  onInteractionStart: vi.fn(),
  onValueCommit: vi.fn(),
  onInteractionCancel: vi.fn(),
  onVolumeButtonPress: vi.fn(),
};

describe("VolumeControl", () => {
  afterEach(cleanup);
  it.each([
    [0, false, "Restore volume", "0 percent, silent", "silent"],
    [20, false, "Mute", "20 percent", "low"],
    [50, false, "Mute", "50 percent", "high"],
    [80, true, "Unmute", "80 percent, muted", "silent"],
  ])("exposes action and value semantics for %s", (value, muted, label, valueText, iconState) => {
    render(<VolumeControl {...base} playback={playback(value, muted)} value={value} />);
    expect(screen.getByRole("button")).toHaveAccessibleName(label);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", valueText);
    expect(screen.getByTestId("volume-icon-state")).toHaveAttribute("data-state", iconState);
  });
});
