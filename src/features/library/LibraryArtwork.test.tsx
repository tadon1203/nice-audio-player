/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtworkRef } from "@/bindings";

const mocks = vi.hoisted(() => ({
  resolveArtworkUrl: vi.fn(),
  cache: new Map<string, string>(),
  pending: new Map<string, Promise<string>>(),
}));
vi.mock("@/lib/artwork-url", () => ({
  getCachedArtworkUrl: (artwork: ArtworkRef | null) =>
    artwork ? (mocks.cache.get(artwork.contentHash) ?? null) : null,
  resolveArtworkUrlCached: (artwork: ArtworkRef) => {
    const key = artwork.contentHash;
    if (mocks.cache.has(key)) return Promise.resolve(mocks.cache.get(key)!);
    if (mocks.pending.has(key)) return mocks.pending.get(key)!;
    const promise = mocks.resolveArtworkUrl(artwork).then(
      (value: string) => {
        mocks.cache.set(key, value);
        mocks.pending.delete(key);
        return value;
      },
      (error: unknown) => {
        mocks.pending.delete(key);
        throw error;
      },
    );
    mocks.pending.set(key, promise);
    return promise;
  },
}));

import { LibraryArtwork, useLibraryArtworkUrl } from "./LibraryArtwork";

function Probe({ artwork }: { artwork: ArtworkRef | null }) {
  const url = useLibraryArtworkUrl(artwork);
  return <output data-testid="url">{url ?? "placeholder"}</output>;
}

const artwork = (name: string): ArtworkRef => ({
  contentHash: name,
  mimeType: "jpeg",
  relativePath: `${name}.jpg`,
});

describe("useLibraryArtworkUrl", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.cache.clear();
    mocks.pending.clear();
  });

  it("hydrates a remount synchronously from a resolved cache entry", async () => {
    const ref = artwork("cover");
    mocks.resolveArtworkUrl.mockResolvedValueOnce("asset://cover");
    const first = render(<Probe artwork={ref} />);
    await act(async () => undefined);
    expect(mocks.resolveArtworkUrl).toHaveBeenCalledOnce();
    expect(screen.getByTestId("url")).toHaveTextContent("asset://cover");

    first.unmount();
    render(<Probe artwork={ref} />);
    expect(screen.getByTestId("url")).toHaveTextContent("asset://cover");
    expect(mocks.resolveArtworkUrl).toHaveBeenCalledOnce();
  });

  it("caches resolver failures as a placeholder", async () => {
    const ref = artwork("missing");
    mocks.resolveArtworkUrl.mockImplementation(() => Promise.reject(new Error("missing")));
    const first = render(<Probe artwork={ref} />);
    await act(async () => undefined);
    expect(screen.getByTestId("url")).toHaveTextContent("placeholder");
    expect(mocks.resolveArtworkUrl).toHaveBeenCalled();

    first.unmount();
    render(<Probe artwork={ref} />);
    expect(screen.getByTestId("url")).toHaveTextContent("placeholder");
    expect(mocks.resolveArtworkUrl).toHaveBeenCalledTimes(2);
  });

  it("does not show a previous artwork URL for a new artwork identity", async () => {
    const first = artwork("first");
    const second = artwork("second");
    mocks.resolveArtworkUrl.mockResolvedValueOnce("asset://first");
    const view = render(<Probe artwork={first} />);
    await act(async () => undefined);
    expect(screen.getByTestId("url")).toHaveTextContent("asset://first");

    mocks.resolveArtworkUrl.mockReturnValueOnce(new Promise<string>(() => undefined));
    view.rerender(<Probe artwork={second} />);
    expect(screen.getByTestId("url")).toHaveTextContent("placeholder");
  });

  it("shares a pending request across fresh objects with the same content hash", async () => {
    const first = artwork("shared");
    const second = { ...first };
    const request = deferred<string>();
    mocks.resolveArtworkUrl.mockReturnValueOnce(request.promise);
    const view = render(<Probe artwork={first} />);
    view.rerender(<Probe artwork={second} />);
    await act(async () => request.resolve("asset://shared"));
    expect(screen.getByTestId("url")).toHaveTextContent("asset://shared");
    expect(mocks.resolveArtworkUrl).toHaveBeenCalledOnce();
  });

  it("retries a resolver failure on a later mount", async () => {
    const ref = artwork("retry");
    mocks.resolveArtworkUrl.mockRejectedValueOnce(new Error("missing"));
    const first = render(<Probe artwork={ref} />);
    await act(async () => undefined);
    first.unmount();
    mocks.resolveArtworkUrl.mockResolvedValueOnce("asset://retry");
    render(<Probe artwork={{ ...ref }} />);
    await act(async () => undefined);
    expect(screen.getByTestId("url")).toHaveTextContent("asset://retry");
    expect(mocks.resolveArtworkUrl).toHaveBeenCalledTimes(2);
  });

  it("uses a placeholder after an image error and recovers for a new URL", async () => {
    const view = render(<LibraryArtwork artwork={null} resolvedUrl="asset://broken" />);
    await act(async () => undefined);
    const image = document.querySelector('[data-slot="library-artwork"] img');
    expect(image).not.toBeNull();
    if (!image) return;
    fireEvent.error(image);
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="library-artwork"] img[src]'),
      ).not.toBeInTheDocument(),
    );
    view.rerender(<LibraryArtwork artwork={null} resolvedUrl="asset://recovered" />);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="library-artwork"] img[src]')).toHaveAttribute(
        "src",
        "asset://recovered",
      ),
    );
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
      resolve = resolvePromise;
    });
    return { promise, resolve };
  }
});
