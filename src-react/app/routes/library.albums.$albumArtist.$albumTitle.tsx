import { createFileRoute } from "@tanstack/react-router";
import { AlbumDetailsPage } from "@/pages/album-details";

export const Route = createFileRoute("/library/albums/$albumArtist/$albumTitle")({
  component: AlbumDetailsPage,
});
