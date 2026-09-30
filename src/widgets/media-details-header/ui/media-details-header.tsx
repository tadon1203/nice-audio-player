import type { ReactNode } from "react";
import type { ArtworkRef } from "@/shared/ipc";
import { SharedArtwork } from "@/shared/ui/shared-artwork";
import { useArtworkBackdrop } from "@/entities/settings";
import { ArtworkLight } from "@/shared/ui/artwork-light";
import { PageTitle } from "@/shared/ui/headings";

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
  const backdrop = useArtworkBackdrop((state) => state.enabled);
  return (
    <div className="@container relative -mx-6 mt-8 px-6 pt-6 pb-6 lg:-mx-10 lg:px-10">
      {backdrop && (
        <ArtworkLight
          artwork={artwork}
          strength="medium"
          className="-top-8 -bottom-16 mask-[radial-gradient(ellipse_85%_68%_at_9rem_32%,black_15%,transparent)]"
        />
      )}
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
