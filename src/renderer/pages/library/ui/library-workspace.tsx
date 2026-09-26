import { useRef, type ReactNode, type RefObject } from "react";
import { useElementScrollRestoration } from "@tanstack/react-router";
import { libraryCommandErrorMessage } from "@/renderer/entities/library";
import { formatCount } from "@/renderer/shared/lib/format";
import { useScrollTopOnChange } from "@/renderer/shared/lib/use-scroll-top-on-change";
import type { SortOption } from "@/renderer/shared/ui/collection-sort-control";
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
  viewportRef: RefObject<HTMLDivElement | null>;
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
  children: (items: Item[], scroll: LibraryScroll) => ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollEntry = useElementScrollRestoration({ id: scrollRestorationId });
  useScrollTopOnChange(viewportRef, stateKey);
  const { statusQuery, statusMessage, query, viewState } = catalog;

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

      <div className="min-h-0">
        <WorkspaceScroll
          scrollRestorationId={scrollRestorationId}
          viewportRef={viewportRef}
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
              {children(query.items, { viewportRef, initialOffset: scrollEntry?.scrollY })}
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
