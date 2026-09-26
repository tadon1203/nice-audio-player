import { createFileRoute } from "@tanstack/react-router";
import { ArtistDetailsPage } from "@/renderer/pages/artist-details";

export const Route = createFileRoute("/library/album-artists/$artistName")({
  component: ArtistDetailsPage,
});
