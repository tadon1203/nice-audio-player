import { useMemo, useRef } from "react";
import { Link, useElementScrollRestoration, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useArtistDetailsWorkspace } from "../model/use-artist-details-workspace";
import {
  artistAlbumSortOptions,
  libraryCommandErrorMessage,
  toggleSortDirection,
  type LibraryAlbumArtistKey,
} from "@/renderer/entities/library";
import { CollectionSortControl } from "@/renderer/shared/components/collection-sort-control";
import { WorkspaceContainer } from "@/renderer/shared/layout/workspace-container";
import { MISSING, formatCount } from "@/renderer/shared/lib/format";
import { Alert, AlertAction, AlertDescription } from "@/renderer/shared/ui/shadcn/alert";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Empty, EmptyDescription } from "@/renderer/shared/ui/shadcn/empty";
import { Spinner } from "@/renderer/shared/ui/shadcn/spinner";
import { MediaGrid } from "@/renderer/widgets/media-grid";
import { MediaDetailsHeader } from "@/renderer/widgets/media-details-header";

export function ArtistDetailsPage({ artistName }: { artistName: string }) {
  const key = useMemo<LibraryAlbumArtistKey>(() => ({ name: artistName }), [artistName]);
  const search = useSearch({ from: "/library" });
  const navigate = useNavigate({ from: "/library" });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRestorationId = `artist-${encodeURIComponent(artistName)}`;
  useElementScrollRestoration({ id: scrollRestorationId });
  const selection = {
    key: search.artistAlbumsSort,
    direction: search.artistAlbumsDirection,
  } as const;
  const workspace = useArtistDetailsWorkspace(key, selection);

  const setSort = (next: typeof selection) => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
    return navigate({
      to: ".",
      replace: true,
      search: (previous) => ({
        ...previous,
        artistAlbumsSort: next.key,
        artistAlbumsDirection: next.direction,
      }),
    });
  };

  return (
    <div
      ref={scrollContainerRef}
      data-scroll-restoration-id={scrollRestorationId}
      className="h-full min-h-0 overflow-y-auto [scrollbar-gutter:stable]"
    >
      <WorkspaceContainer className="py-8 pb-16">
        <Link
          to="/library/album-artists"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Album Artists
        </Link>

        {workspace.loadState === "loading" ? (
          <div
            role="status"
            className="mt-8 flex items-center gap-2 py-8 text-sm text-muted-foreground"
          >
            <Spinner className="size-4" />
            Reading artist…
          </div>
        ) : workspace.loadState === "error" || !workspace.artist ? (
          <Alert variant="destructive" className="mt-8" role="alert">
            <AlertDescription>{libraryCommandErrorMessage(workspace.error)}</AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void workspace.reload()}
              >
                Retry
              </Button>
            </AlertAction>
          </Alert>
        ) : (
          <>
            <MediaDetailsHeader
              kind="Artist"
              title={artistName}
              artwork={workspace.artist.artwork}
              round
            >
              <p className="mt-4 text-sm tabular-nums text-muted-foreground">
                {formatCount(workspace.artist.albumCount, "album")} ·{" "}
                {formatCount(workspace.artist.trackCount, "track")}
              </p>
            </MediaDetailsHeader>

            <section className="mt-10" aria-labelledby="artist-albums-title">
              <div className="mb-5 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                <h2 id="artist-albums-title" className="text-lg font-medium text-foreground">
                  Albums
                </h2>
                <CollectionSortControl
                  selectLabel="Sort artist albums"
                  value={selection.key}
                  options={artistAlbumSortOptions}
                  direction={selection.direction}
                  onValueChange={(value) => void setSort({ key: value, direction: "ascending" })}
                  onToggleDirection={() =>
                    void setSort({
                      key: selection.key,
                      direction: toggleSortDirection(selection.direction),
                    })
                  }
                />
              </div>

              {workspace.albums.length > 0 ? (
                <MediaGrid>
                  {workspace.albums.map((album) => (
                    <Link
                      key={`${album.key.albumArtist}\u0000${album.key.title}`}
                      to="/library/albums/$albumArtist/$albumTitle"
                      params={{ albumArtist: album.key.albumArtist, albumTitle: album.key.title }}
                      state={{ parentArtist: artistName }}
                      aria-label={`Open album ${album.key.title}`}
                      className="group min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Artwork
                        artwork={album.artwork}
                        alt={`${album.key.title} artwork`}
                        className="w-full transition-opacity group-hover:opacity-80"
                      />
                      <span className="mt-3 block w-full truncate text-sm font-medium text-foreground">
                        {album.key.title}
                      </span>
                      <span className="mt-1 block w-full text-sm tabular-nums text-muted-foreground">
                        {album.year ?? MISSING}
                      </span>
                    </Link>
                  ))}
                </MediaGrid>
              ) : (
                <Empty className="mt-8" role="status">
                  <EmptyDescription>No albums were indexed for this artist.</EmptyDescription>
                </Empty>
              )}
            </section>

            {workspace.nextCursor ? (
              <div className="mt-7 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void workspace.loadMore()}
                  disabled={workspace.loadState === "loadingMore"}
                >
                  {workspace.loadState === "loadingMore" ? "Loading more…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </WorkspaceContainer>
    </div>
  );
}
