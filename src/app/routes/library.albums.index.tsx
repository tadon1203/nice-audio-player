import { createFileRoute } from "@tanstack/react-router";
import { AlbumsPage } from "@/pages/library";

export const Route = createFileRoute("/library/albums/")({
  component: AlbumsPage,
});
