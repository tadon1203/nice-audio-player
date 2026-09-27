import type { ReactNode } from "react";
import type { ArtworkRef } from "@/shared/ipc";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { ArtworkLight } from "@/renderer/shared/ui/artwork-light";
import { PageTitle } from "@/renderer/shared/ui/headings";

export function MediaDetailsHeader({
  kind,
  title,
  artist,
  artwork,
  round = false,
  children,
  strip,
}: {
  kind: string;
  title: string;
  artist?: string;
  artwork: ArtworkRef | null;
  round?: boolean;
  children?: ReactNode;
  /** The track-structure Strip along the header band's bottom edge (album details only). */
  strip?: ReactNode;
}) {
  return (
    <div className="@container relative -mx-6 mt-8 px-6 pt-6 pb-6 lg:-mx-10 lg:px-10">
      <ArtworkLight artwork={artwork} strength="medium" />
      <header className="relative grid grid-cols-1 items-start gap-8 @md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] @md:items-end">
        <Artwork
          artwork={artwork}
          alt={`${title} artwork`}
          className={cn("w-full max-w-56", round && "rounded-full")}
          loading="eager"
        />
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {kind}
          </p>
          <PageTitle>{title}</PageTitle>
          {artist ? <p className="mt-2 text-base text-muted-foreground">{artist}</p> : null}
          {children}
        </div>
      </header>
      {strip ? <div className="relative mt-6">{strip}</div> : null}
    </div>
  );
}
