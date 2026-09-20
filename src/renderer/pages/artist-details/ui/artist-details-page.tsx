import { useMemo } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import { useArtistDetailsWorkspace } from "../model/use-artist-details-workspace";
import {
  libraryCommandErrorMessage,
  type LibraryAlbumArtistKey,
} from "@/renderer/entities/library";
import { Alert } from "@/renderer/shared/ui/alert";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { Button } from "@/renderer/shared/ui/button";
import { Empty, EmptyDescription } from "@/renderer/shared/ui/empty";
import { Field, FieldLabel } from "@/renderer/shared/ui/field";
import { ScrollArea } from "@/renderer/shared/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/shared/ui/select";
import { Spinner } from "@/renderer/shared/ui/spinner";
import { MediaDetailsHeader } from "@/renderer/widgets/media-details-header";

const sortOptions = [
  { key: "year", label: "Year" },
  { key: "title", label: "Title" },
] as const;

export function ArtistDetailsPage({ artistName }: { artistName: string }) {
  const key = useMemo<LibraryAlbumArtistKey>(() => ({ name: artistName }), [artistName]);
  const search = useSearch({ from: "/library" });
  const navigate = useNavigate({ from: "/library" });
  const selection = {
    key: search.artistAlbumsSort,
    direction: search.artistAlbumsDirection,
  } as const;
  const workspace = useArtistDetailsWorkspace(key, selection);

  const setSort = (next: typeof selection) =>
    navigate({
      to: ".",
      search: (previous) => ({
        ...previous,
        artistAlbumsSort: next.key,
        artistAlbumsDirection: next.direction,
      }),
    });

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-[1360px] px-[clamp(24px,3vw,40px)] py-8 pb-16">
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
              {libraryCommandErrorMessage(workspace.error)}
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
                  {workspace.artist.albumCount ?? 0} albums · {workspace.artist.trackCount ?? 0}{" "}
                  tracks
                </p>
              </MediaDetailsHeader>

              <section className="mt-10" aria-labelledby="artist-albums-title">
                <div className="mb-5 flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
                  <h2 id="artist-albums-title" className="text-base font-medium text-foreground">
                    Albums
                  </h2>
                  <Field className="flex w-auto items-center gap-2">
                    <FieldLabel className="text-sm text-muted-foreground">Sort</FieldLabel>
                    <Select
                      value={selection.key}
                      items={sortOptions.map((option) => ({
                        label: option.label,
                        value: option.key,
                      }))}
                      onValueChange={(value) => {
                        if (value === "year" || value === "title") {
                          void setSort({ key: value, direction: "ascending" });
                        }
                      }}
                    >
                      <SelectTrigger
                        className="h-9 w-[188px] shrink-0"
                        aria-label="Sort artist albums"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {sortOptions.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        selection.direction === "ascending"
                          ? "Sort descending"
                          : "Sort ascending"
                      }
                      onClick={() =>
                        void setSort({
                          key: selection.key,
                          direction:
                            selection.direction === "ascending" ? "descending" : "ascending",
                        })
                      }
                    >
                      {selection.direction === "ascending" ? (
                        <ArrowUp aria-hidden="true" />
                      ) : (
                        <ArrowDown aria-hidden="true" />
                      )}
                    </Button>
                  </Field>
                </div>

                {workspace.albums.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-x-5 gap-y-8">
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
                          className="transition-opacity group-hover:opacity-80"
                        />
                        <span className="mt-3 block w-full truncate text-sm font-medium text-foreground">
                          {album.key.title}
                        </span>
                        <span className="mt-1 block w-full text-sm tabular-nums text-muted-foreground">
                          {album.year ?? "Unknown year"}
                        </span>
                      </Link>
                    ))}
                  </div>
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
        </div>
      </ScrollArea>
    </div>
  );
}
