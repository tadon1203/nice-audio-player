import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  getScrollRestorationKey: (location) =>
    location.pathname.startsWith("/library/") || location.pathname === "/library"
      ? location.pathname
      : (location.state.__TSR_key ?? location.pathname),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
