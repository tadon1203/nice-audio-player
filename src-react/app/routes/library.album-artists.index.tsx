import { createFileRoute } from "@tanstack/react-router";
import { AlbumArtistsPage } from "@/pages/library";

export const Route = createFileRoute("/library/album-artists/")({
  component: AlbumArtistsPage,
});
