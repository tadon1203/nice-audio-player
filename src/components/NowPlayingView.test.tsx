/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ValidatedAudioFile } from "@/bindings";
import { layoutStressFixtures } from "@/test/layout-stress-fixtures";

import { NowPlayingView } from "./NowPlayingView";

const file: ValidatedAudioFile = {
  path: "C:/Music/lecture.flac",
  fileName: layoutStressFixtures.longFilename,
  extension: "flac",
};

const common = {
  isValidatingFile: false,
  isFileSelectionDisabled: false,
  validationError: null,
  onSelectFile: vi.fn(),
};

describe("NowPlayingView", () => {
  afterEach(cleanup);

  it("renders the empty state and accessible file action", () => {
    render(<NowPlayingView {...common} validatedFile={null} />);

    expect(screen.getByText("Listening room")).toHaveClass(
      "now-playing-view__editorial",
      "font-character",
    );
    expect(screen.getByRole("heading", { name: "No audio selected" })).toBeVisible();
    expect(screen.getByText("Choose an audio file to begin.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose audio file" })).toBeEnabled();
  });

  it("preserves the complete filename as an accessible title", () => {
    render(<NowPlayingView {...common} validatedFile={file} />);

    expect(screen.getByText("Listening room")).toBeVisible();
    expect(screen.getByText("Listening room")).toHaveClass("now-playing-view__editorial");
    const heading = screen.getByRole("heading", { name: file.fileName });
    expect(heading).toHaveAttribute("title", file.fileName);
    expect(heading).toHaveClass("now-playing-view__filename");
    expect(screen.getByText(".flac")).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose another file" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Choose another file" })).toHaveClass(
      "now-playing-view__action",
    );
  });

  it("shows validation progress without changing the action geometry", () => {
    render(
      <NowPlayingView {...common} validatedFile={null} isValidatingFile isFileSelectionDisabled />,
    );

    expect(screen.getByText("Validating audio file…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Validating…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: "Validating…" })).toBeDisabled();
  });

  it("uses disabled tokens without changing the file action dimensions", () => {
    render(<NowPlayingView {...common} validatedFile={null} isFileSelectionDisabled />);

    expect(screen.getByRole("button", { name: "Choose audio file" })).toHaveClass(
      "min-h-12",
      "disabled:bg-surface-pressed",
      "disabled:text-text-disabled",
    );
  });
});
