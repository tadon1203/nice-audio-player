import { createFileRoute } from "@tanstack/react-router";
import { AlbumArtistsPage } from "@/renderer/pages/library";

export const Route = createFileRoute("/library/album-artists/")({
  component: AlbumArtistsPage,
});
