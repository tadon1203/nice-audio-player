import type { ReactNode } from "react";
import type { ArtworkRef } from "@/shared/ipc";
import { Artwork } from "@/renderer/shared/ui/artwork";

export function MediaDetailsHeader({
  kind,
  title,
  artist,
  artwork,
  round = false,
  children,
}: {
  kind: string;
  title: string;
  artist?: string;
  artwork: ArtworkRef | null;
  round?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="@container mt-8">
      <header className="grid grid-cols-1 items-start gap-8 @md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] @md:items-end">
        <Artwork
          artwork={artwork}
          alt={`${title} artwork`}
          className={`w-full max-w-56 ${round ? "rounded-full" : ""}`}
          loading="eager"
        />
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            {kind}
          </p>
          <h1 className="text-3xl font-normal leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {artist ? <p className="mt-2 text-base text-muted-foreground">{artist}</p> : null}
          {children}
        </div>
      </header>
    </div>
  );
}
