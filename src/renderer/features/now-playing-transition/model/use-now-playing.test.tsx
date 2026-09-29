import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it } from "vitest";
import { useNowPlaying } from "./use-now-playing";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Harness = {
  controls: () => ReturnType<typeof useNowPlaying>;
  libraryMounts: () => number;
  pathname: () => string;
  unmount: () => void;
};

async function mount(initialEntries: string[] = ["/library"]): Promise<Harness> {
  let controls: ReturnType<typeof useNowPlaying> | undefined;
  let libraryMounts = 0;

  function Library() {
    useEffect(() => {
      libraryMounts += 1;
    }, []);
    return <p>Library</p>;
  }
  function Shell() {
    const current = useNowPlaying();
    useEffect(() => {
      controls = current;
    });
    return <Outlet />;
  }
  const rootRoute = createRootRoute({ component: Shell });
  const library = createRoute({
    getParentRoute: () => rootRoute,
    path: "/library",
    component: Library,
  });
  const settings = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <p>Settings</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([library, settings]),
    history: createMemoryHistory({ initialEntries }),
  });

  const container = document.createElement("div");
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<RouterProvider router={router} />);
    await router.load();
  });
  return {
    controls: () => controls!,
    libraryMounts: () => libraryMounts,
    pathname: () => router.state.location.pathname,
    unmount: () => act(() => root.unmount()),
  };
}

let harness: Harness | undefined;
afterEach(() => harness?.unmount());

describe("useNowPlaying", () => {
  it("opens over the current location without remounting it", async () => {
    harness = await mount();
    expect(harness.controls().isOpen).toBe(false);

    await act(async () => harness!.controls().open());

    expect(harness.controls().isOpen).toBe(true);
    expect(harness.pathname()).toBe("/library");
    expect(harness.libraryMounts()).toBe(1);
  });

  it("closes with Back and returns to the same location", async () => {
    harness = await mount();
    await act(async () => harness!.controls().open());

    await act(async () => harness!.controls().close());

    expect(harness.controls().isOpen).toBe(false);
    expect(harness.pathname()).toBe("/library");
    expect(harness.libraryMounts()).toBe(1);
  });

  it("does not stack layers when opened twice", async () => {
    harness = await mount();
    await act(async () => harness!.controls().open());
    await act(async () => harness!.controls().open());
    await act(async () => harness!.controls().close());

    expect(harness.controls().isOpen).toBe(false);
  });

  it("is a no-op to close when nothing is open", async () => {
    harness = await mount();
    await act(async () => harness!.controls().close());

    expect(harness.controls().isOpen).toBe(false);
    expect(harness.pathname()).toBe("/library");
  });

  it("toggles open and closed", async () => {
    harness = await mount();
    expect(harness.controls().isOpen).toBe(false);

    await act(async () => harness!.controls().toggle());
    expect(harness.controls().isOpen).toBe(true);
    expect(harness.pathname()).toBe("/library");
    expect(harness.libraryMounts()).toBe(1);

    await act(async () => harness!.controls().toggle());
    expect(harness.controls().isOpen).toBe(false);
    expect(harness.pathname()).toBe("/library");
    expect(harness.libraryMounts()).toBe(1);
  });
});
