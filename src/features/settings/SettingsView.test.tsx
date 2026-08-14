/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryRoot } from "@/bindings";

const mocks = vi.hoisted(() => ({
  listLibraryRoots: vi.fn(),
  removeLibraryRoot: vi.fn(),
  isLibraryCommandError: vi.fn(() => false),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@/api/library", () => ({
  cancelLibraryScan: vi.fn(),
  isLibraryCommandError: mocks.isLibraryCommandError,
  listLibraryRoots: mocks.listLibraryRoots,
  removeLibraryRoot: mocks.removeLibraryRoot,
  registerLibraryRoot: vi.fn(),
  setLibraryRootEnabled: vi.fn(),
  startLibraryScan: vi.fn(),
}));

import { SettingsView } from "./SettingsView";

const root = (id: string, path: string): LibraryRoot => ({
  id,
  path,
  enabled: true,
  scanGeneration: 0,
  lastSuccessfulScanAtMs: null,
});

function renderSettings() {
  document.body.innerHTML = '<div id="root"></div><div id="overlay-root"></div>';
  return render(
    <SettingsView
      outputDevices={[]}
      selectedOutput={{ kind: "systemDefault" }}
      onOutputSelectionChange={vi.fn()}
      onRefreshDevices={vi.fn()}
    />,
  );
}

describe("SettingsView root removal", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '<div id="root"></div><div id="overlay-root"></div>';
    vi.clearAllMocks();
  });

  it("restores focus to the clicked root when cancelling among multiple roots", async () => {
    const roots = [root("1", "C:/Root A"), root("2", "C:/Root B")];
    mocks.listLibraryRoots.mockResolvedValue(roots);
    renderSettings();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2));
    const buttons = screen.getAllByRole("button", { name: "Remove" });
    buttons[0].focus();
    fireEvent.click(buttons[0]);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(buttons[0]).toHaveFocus());
    expect(buttons[1]).not.toHaveFocus();
  });

  it("refreshes before closing and focuses Add folder after successful removal", async () => {
    const first = root("1", "C:/Root A");
    const second = root("2", "C:/Root B");
    mocks.listLibraryRoots.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second]);
    mocks.removeLibraryRoot.mockResolvedValue(undefined);
    renderSettings();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Add folder" })).toHaveFocus());
    expect(screen.queryByText("C:/Root A")).not.toBeInTheDocument();
  });
});
