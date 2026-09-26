import { createFileRoute } from "@tanstack/react-router";
import { AlbumsPage } from "@/renderer/pages/library";

export const Route = createFileRoute("/library/albums/")({
  component: AlbumsPage,
});
