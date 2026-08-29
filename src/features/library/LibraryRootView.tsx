import { LibraryPresentationTabs } from "./LibraryPresentationTabs";
import { useLibraryRuntime, useLibraryWorkspace, libraryRetentionKey } from "./LibraryWorkspace";
import { LibraryBrowserSurface } from "./LibraryBrowserSurface";
import type { LibraryPresentation, LibraryViewProps } from "./library-view-types";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useLayoutEffect, useRef } from "react";

export function LibraryRootView({
  presentation,
  onChangePresentation,
  ...props
}: LibraryViewProps & {
  presentation: LibraryPresentation;
  onChangePresentation: (value: LibraryPresentation) => void;
}) {
  const { rawSearch, setRawSearch } = useLibraryWorkspace();
  const { scrollRegistry } = useLibraryRuntime();
  const rawValue = rawSearch[presentation];
  const presentationScrollPositions = useRef(new Map<LibraryPresentation, number>());
  useLayoutEffect(() => {
    const restored =
      presentationScrollPositions.current.get(presentation) ??
      scrollRegistry.get(libraryRetentionKey.root(presentation));
    if (restored === undefined || restored === 0) return;
    const frame = requestAnimationFrame(() => {
      const surface = document.querySelector<HTMLElement>('[data-library-surface="browser"]');
      if (surface && typeof surface.scrollTo === "function") {
        surface.scrollTo({ top: restored, behavior: "auto" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [presentation, scrollRegistry]);
  return (
    <Tabs
      value={presentation}
      onValueChange={(value) => {
        const surface = document.querySelector<HTMLElement>('[data-library-surface="browser"]');
        if (surface) {
          presentationScrollPositions.current.set(presentation, surface.scrollTop);
          scrollRegistry.set(libraryRetentionKey.root(presentation), surface.scrollTop);
        }
        onChangePresentation(value as LibraryPresentation);
      }}
      className="library-root-surface"
    >
      <header className="library-view__header page-frame">
        <div className="content-frame library-view__header-content">
          <h1 className="type-application-heading">Library</h1>
          <div className="library-view__controls">
            <LibraryPresentationTabs />
            <label className="library-view__search">
              <span className="sr-only">
                Filter {presentation === "albumArtists" ? "album artists" : presentation}
              </span>
              <input
                value={rawValue}
                onChange={(event) => setRawSearch(event.currentTarget.value)}
                placeholder={
                  presentation === "albums"
                    ? "Filter albums…"
                    : presentation === "albumArtists"
                      ? "Filter album artists…"
                      : "Filter tracks…"
                }
              />
            </label>
          </div>
        </div>
      </header>
      <div className="library-presentation-region">
        {(["albums", "albumArtists", "tracks"] as const).map((value) => (
          <TabsContent key={value} value={value} className="library-presentation-panel">
            {presentation === value ? (
              <LibraryBrowserSurface key={presentation} {...props} presentation={value} />
            ) : null}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
