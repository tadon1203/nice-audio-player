import { getRouteApi } from "@tanstack/react-router";
import { AlbumDetailsPage } from "@/renderer/pages/album-details";

const route = getRouteApi("/library/albums/$albumArtist/$albumTitle");

export function AlbumDetailsRoute() {
  const { albumArtist, albumTitle } = route.useParams();
  return <AlbumDetailsPage albumArtist={albumArtist} albumTitle={albumTitle} />;
}
