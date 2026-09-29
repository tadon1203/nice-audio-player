import { useEffect, useRef, useState, type ReactNode } from "react";
import { useElementScrollRestoration } from "@tanstack/react-router";
import { libraryCommandErrorMessage } from "@/renderer/entities/library";
import { formatCount } from "@/renderer/shared/lib/format";
import { useScrollTopOnChange } from "@/renderer/shared/lib/use-scroll-top-on-change";
import type { SortOption } from "@/renderer/shared/ui/collection-sort-control";
import { ScrollIndex } from "@/renderer/shared/ui/scroll-index";
import { WorkspaceScroll } from "@/renderer/shared/ui/workspace-scroll";
import {
  EmptyStatus,
  ErrorAlert,
  LoadMoreButton,
  LoadingStatus,
} from "@/renderer/shared/ui/workspace-status";
import type { LibrarySortDirection } from "@/shared/ipc";
import type { LibraryCatalogState } from "../model/use-library-catalog";
import { LibraryToolbar } from "./library-toolbar";

export type LibraryPresentationMeta = {
  title: string;
  singular: string;
  plural: string;
  searchLabel: string;
  searchPlaceholder: string;
};

export type LibraryScroll = {
  /** `null` until the scroll region has mounted. */
  viewport: HTMLDivElement | null;
  initialOffset: number | undefined;
};

/**
 * The shell shared by every library presentation: toolbar, one scroll region, and
 * exactly one of loading, error, empty, or content. The presentation supplies
 * how its items are rendered.
 */
export function LibraryWorkspace<Item, Key extends string>({
  meta,
  scrollRestorationId,
  filter,
  onFilterChange,
  stateKey,
  sort,
  catalog,
  indexFor,
  children,
}: {
  meta: LibraryPresentationMeta;
  scrollRestorationId: string;
  filter: string;
  onFilterChange: (filter: string) => void;
  /** Changes when the filter or sort does, returning the list to the top. */
  stateKey: string;
  sort?: {
    key: Key;
    direction: LibrarySortDirection;
    options: readonly SortOption<Key>[];
    onKeyChange: (key: Key) => void;
    onToggleDirection: () => void;
  };
  catalog: LibraryCatalogState<Item>;
  /**
   * The index key of an item (a letter or a year) for the big label shown while scrolling.
   * Needs items rendered as `MediaGridItem`s with their `index`.
   */
  indexFor?: (item: Item) => string;
  children: (items: Item[], scroll: LibraryScroll) => ReactNode;
}) {
  // State rather than a ref: descendants (the virtualizer) must re-render once the viewport exists.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const scrollEntry = useElementScrollRestoration({ id: scrollRestorationId });
  useScrollTopOnChange(viewport, stateKey);
  const { statusQuery, statusMessage, query, viewState } = catalog;
  const scrollIndex = useScrollIndex(
    viewport,
    indexFor === undefined
      ? null
      : (i) => {
          const item = query.items[i];
          return item === undefined ? null : indexFor(item);
        },
  );

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <LibraryToolbar
        title={meta.title}
        countLabel={formatCount(query.totalCount, meta.singular, meta.plural)}
        searchLabel={meta.searchLabel}
        searchPlaceholder={meta.searchPlaceholder}
        filter={filter}
        updating={catalog.updating}
        onFilterChange={onFilterChange}
        sort={sort}
      />

      <div className="@container relative min-h-0">
        <ScrollIndex label={scrollIndex.label} visible={scrollIndex.visible} />
        <WorkspaceScroll
          scrollRestorationId={scrollRestorationId}
          viewportRef={setViewport}
          contentClassName="pt-6 pb-16"
        >
          {viewState === "loading" ? <LoadingStatus>Loading library…</LoadingStatus> : null}

          {viewState === "statusError" ? (
            <ErrorAlert
              message={libraryCommandErrorMessage(statusQuery.error)}
              onRetry={() => void statusQuery.refetch()}
            />
          ) : null}

          {viewState === "unavailable" ? <ErrorAlert message={statusMessage ?? ""} /> : null}

          {viewState === "catalogError" ? (
            <ErrorAlert
              message={libraryCommandErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : null}

          {viewState === "empty" ? (
            <EmptyStatus>
              {filter === "" ? `No ${meta.plural} in your library.` : `No results for “${filter}”.`}
            </EmptyStatus>
          ) : null}

          {viewState === "content" ? (
            <>
              {children(query.items, { viewport, initialOffset: scrollEntry?.scrollY })}
              {query.hasNextPage ? (
                <LoadMoreButton
                  pending={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                />
              ) : null}
            </>
          ) : null}
        </WorkspaceScroll>
      </div>
    </div>
  );
}

/** How long the index stays after the last scroll. */
const INDEX_HOLD_MS = 800;

/**
 * Follows a scroll region and reports the index label of the first item near its top
 * (found from the `data-index` of the list item under a point), and whether it is being
 * scrolled. Sampled once per frame.
 */
function useScrollIndex(
  viewport: HTMLElement | null,
  labelAt: ((index: number) => string | null) | null,
) {
  const [state, setState] = useState<{ label: string | null; visible: boolean }>({
    label: null,
    visible: false,
  });

  // Read through a ref so a new closure each render does not restart the listener (and its timer).
  const latest = useRef(labelAt);
  latest.current = labelAt;
  const enabled = labelAt !== null;

  useEffect(() => {
    if (viewport === null || !enabled) return;
    let frame = 0;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const sample = () => {
      frame = 0;
      const box = viewport.getBoundingClientRect();
      let label: string | null = null;
      for (const offset of [16, 48, 96, 160]) {
        const hit = document.elementFromPoint(box.left + 64, box.top + offset);
        const index = hit?.closest<HTMLElement>("li[data-index]")?.dataset.index;
        if (index !== undefined) {
          label = latest.current?.(Number(index)) ?? null;
          break;
        }
      }
      setState((current) => ({ label: label ?? current.label, visible: true }));
      clearTimeout(hold);
      hold = setTimeout(
        () => setState((current) => ({ ...current, visible: false })),
        INDEX_HOLD_MS,
      );
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(sample);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(hold);
    };
  }, [viewport, enabled]);

  return state;
}
