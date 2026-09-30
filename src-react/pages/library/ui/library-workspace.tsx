import { useEffect, useState, type ReactNode } from "react";
import { Link, useElementScrollRestoration } from "@tanstack/react-router";
import { libraryCommandErrorMessage } from "@/entities/library";
import { formatCount } from "@/shared/lib/format";
import { useScrollTopOnChange } from "@/shared/lib/use-scroll-top-on-change";
import type { SortOption } from "@/shared/ui/collection-sort-control";
import { ScrollIndex } from "@/shared/ui/scroll-index";
import { WorkspaceScroll } from "@/shared/ui/workspace-scroll";
import {
  EmptyStatus,
  ErrorAlert,
  LoadMoreSentinel,
  LoadingStatus,
} from "@/shared/ui/workspace-status";
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
  /** The list reports the index of its first visible item here (for the scroll index). */
  onTopIndexChange: (index: number) => void;
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
   * The list must report its first visible item through `scroll.onTopIndexChange`.
   */
  indexFor?: (item: Item) => string;
  children: (items: Item[], scroll: LibraryScroll) => ReactNode;
}) {
  // State rather than a ref: descendants (the virtualizer) must re-render once the viewport exists.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const scrollEntry = useElementScrollRestoration({ id: scrollRestorationId });
  useScrollTopOnChange(viewport, stateKey);
  const { statusQuery, statusMessage, query, viewState } = catalog;
  const [topIndex, setTopIndex] = useState(0);
  const scrollIndex = useScrollIndex(
    viewport,
    topIndex,
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
              {filter === "" ? (
                <>
                  No {meta.plural} in your library.{" "}
                  <Link to="/settings" className="text-foreground underline underline-offset-4">
                    Add a music folder
                  </Link>
                </>
              ) : (
                `No results for “${filter}”.`
              )}
            </EmptyStatus>
          ) : null}

          {viewState === "content" ? (
            <>
              {children(query.items, {
                viewport,
                initialOffset: scrollEntry?.scrollY,
                onTopIndexChange: setTopIndex,
              })}
              {query.hasNextPage ? (
                <LoadMoreSentinel
                  pending={query.isFetchingNextPage}
                  onLoadMore={() => void query.fetchNextPage()}
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
 * The scroll index label for the item at `topIndex` (reported by the list itself, so nothing
 * is read back from the DOM), and whether the region is being scrolled: it shows while
 * scrolling and for a moment after.
 */
function useScrollIndex(
  viewport: HTMLElement | null,
  topIndex: number,
  labelAt: ((index: number) => string | null) | null,
) {
  const [visible, setVisible] = useState(false);
  const enabled = labelAt !== null;

  useEffect(() => {
    if (viewport === null || !enabled) return;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      setVisible(true);
      clearTimeout(hold);
      hold = setTimeout(() => setVisible(false), INDEX_HOLD_MS);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      clearTimeout(hold);
    };
  }, [viewport, enabled]);

  return { label: labelAt?.(topIndex) ?? null, visible };
}
