// jsdom has no `matchMedia`, which `svelte/motion`'s `prefersReducedMotion` reads as it loads.
// A test that needs reduced motion mocks `svelte/motion` itself.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}
