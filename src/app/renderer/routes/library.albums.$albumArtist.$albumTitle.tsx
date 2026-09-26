import { createFileRoute } from "@tanstack/react-router";
import { AlbumDetailsRoute } from "@/app/renderer/ui/album-details-route";

export const Route = createFileRoute("/library/albums/$albumArtist/$albumTitle")({
  component: AlbumDetailsRoute,
});
