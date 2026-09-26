import { getRouteApi } from "@tanstack/react-router";
import { ArtistDetailsPage } from "@/renderer/pages/artist-details";

const route = getRouteApi("/library/album-artists/$artistName");

export function ArtistDetailsRoute() {
  const { artistName } = route.useParams();
  return <ArtistDetailsPage artistName={artistName} />;
}
