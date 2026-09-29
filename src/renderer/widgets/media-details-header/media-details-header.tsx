import type { ReactNode } from "react";
import type { ArtworkRef } from "@/shared/ipc";
import { SharedArtwork } from "@/renderer/shared/ui/shared-artwork";
import { ArtworkLight } from "@/renderer/shared/ui/artwork-light";
import { PageTitle } from "@/renderer/shared/ui/headings";

export function MediaDetailsHeader({
  title,
  artist,
  artwork,
  artworkLayoutId,
  round = false,
  children,
  strip,
}: {
  title: string;
  artist?: string;
  artwork: ArtworkRef | null;
  /** The id of the library tile this artwork came from, so it moves in from there. */
  artworkLayoutId: string;
  round?: boolean;
  children?: ReactNode;
  /** The track-structure Strip along the header band's bottom edge (album details only). */
  strip?: ReactNode;
}) {
  return (
    <div className="@container relative -mx-6 mt-8 px-6 pt-6 pb-6 lg:-mx-10 lg:px-10">
      <ArtworkLight artwork={artwork} strength="medium" />
      <header className="relative grid grid-cols-1 items-start gap-8 @md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] @md:items-end">
        <SharedArtwork
          layoutId={artworkLayoutId}
          artwork={artwork}
          alt={`${title} artwork`}
          round={round}
          className="w-full max-w-56"
          loading="eager"
        />
        <div className="min-w-0">
          <PageTitle>{title}</PageTitle>
          {artist ? <p className="mt-2 text-base text-muted-foreground">{artist}</p> : null}
          {children}
        </div>
      </header>
      {strip ? <div className="relative mt-6">{strip}</div> : null}
    </div>
  );
}
