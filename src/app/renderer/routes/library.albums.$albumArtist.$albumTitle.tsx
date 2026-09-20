import { createFileRoute } from "@tanstack/react-router";
import { AlbumDetailsPage } from "@/renderer/pages/album-details";

export const Route = createFileRoute("/library/albums/$albumArtist/$albumTitle")({
  component: AlbumDetailsRoute,
});

function AlbumDetailsRoute() {
  const { albumArtist, albumTitle } = Route.useParams();
  return <AlbumDetailsPage albumArtist={albumArtist} albumTitle={albumTitle} />;
}
