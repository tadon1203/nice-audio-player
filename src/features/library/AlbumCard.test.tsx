/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryAlbumSummary } from "@/bindings";

vi.mock("./LibraryArtwork", () => ({
  LibraryArtwork: () => <span data-testid="artwork" />,
}));

import { AlbumCard } from "./AlbumCard";

const album: LibraryAlbumSummary = {
  id: "album-1",
  title: "Album title",
  albumArtist: "Album artist",
  artwork: null,
};

describe("AlbumCard", () => {
  afterEach(cleanup);

  it("uses explicit title and artist hierarchy classes and opens the album", () => {
    const onOpen = vi.fn();
    render(<AlbumCard album={album} onOpen={onOpen} />);
    expect(document.querySelector(".library-view__album-title")).toHaveTextContent("Album title");
    expect(document.querySelector(".library-view__album-artist")).toHaveTextContent("Album artist");
    fireEvent.click(screen.getByRole("button", { name: "Open Album title by Album artist" }));
    expect(onOpen).toHaveBeenCalledWith(album);
  });
});
