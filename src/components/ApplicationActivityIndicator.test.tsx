/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationActivity } from "@/bindings";
import { ApplicationActivityIndicator } from "./ApplicationActivityIndicator";

const running: ApplicationActivity = { id: "library-sync", kind: "librarySync", state: "running" };
const attention: ApplicationActivity = {
  id: "library-sync",
  kind: "librarySync",
  state: "attentionRequired",
};

describe("ApplicationActivityIndicator", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delays running state and keeps it visible for the minimum duration", () => {
    const { rerender } = render(<ApplicationActivityIndicator activity={running} />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("status")).toHaveTextContent("Updating library…");
    rerender(<ApplicationActivityIndicator activity={null} />);
    act(() => vi.advanceTimersByTime(599));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows attention immediately", () => {
    render(<ApplicationActivityIndicator activity={attention} />);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole("status")).toHaveTextContent("Library update needs attention");
  });
});
