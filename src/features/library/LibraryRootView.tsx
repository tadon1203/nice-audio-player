import { LibraryPresentationTabs } from "./LibraryPresentationTabs";
import { libraryRetentionKey, useLibraryRuntime, useLibraryWorkspace } from "./LibraryWorkspace";
import { LibraryBrowserSurface } from "./LibraryBrowserSurface";
import type { LibraryPresentation, LibraryViewProps } from "./library-view-types";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useLayoutEffect } from "react";
import { pageFrameClass, contentFrameClass } from "@/components/ui/layout";
import { typographyVariants } from "@/components/ui/typography";

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
  useLayoutEffect(() => {
    const restored = scrollRegistry.get(libraryRetentionKey.root(presentation));
    if (restored === undefined || restored === 0) return;
    const frame = requestAnimationFrame(() => {
      const surface = document.querySelector<HTMLElement>('[data-library-surface="browser"]');
      if (surface && typeof surface.scrollTo === "function")
        surface.scrollTo({ top: restored, behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [presentation, scrollRegistry]);
  return (
    <Tabs
      value={presentation}
      onValueChange={(value) => {
        onChangePresentation(value as LibraryPresentation);
      }}
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6"
    >
      <header
        data-slot="library-header"
        className={`${pageFrameClass} flex flex-col items-start justify-between gap-8 pt-16 app-wide:flex-row app-wide:items-end`}
      >
        <div
          data-slot="library-header-content"
          className={`${contentFrameClass} flex flex-col items-start justify-between gap-8 app-wide:flex-row app-wide:items-end`}
        >
          <h1 className={typographyVariants({ role: "application-heading" })}>Library</h1>
          <div className="flex w-full min-w-0 flex-1 flex-col items-start justify-between gap-4 app-wide:flex-row app-wide:items-end app-wide:gap-8">
            <LibraryPresentationTabs />
            <label className="w-full max-w-[540px]">
              <span className="sr-only">
                Filter {presentation === "albumArtists" ? "album artists" : presentation}
              </span>
              <input
                className="box-border min-h-12 w-full max-w-[540px] rounded-control border border-border-control bg-transparent px-4 font-interface text-body-md text-text-primary app-wide:min-w-[300px]"
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
      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-y-hidden">
        {(["albums", "albumArtists", "tracks"] as const).map((value) => (
          <TabsContent key={value} value={value}>
            {presentation === value ? (
              <LibraryBrowserSurface key={presentation} {...props} presentation={value} />
            ) : null}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
