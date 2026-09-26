import { createFileRoute } from "@tanstack/react-router";
import { ArtistDetailsRoute } from "@/app/renderer/ui/artist-details-route";

export const Route = createFileRoute("/library/album-artists/$artistName")({
  component: ArtistDetailsRoute,
});
