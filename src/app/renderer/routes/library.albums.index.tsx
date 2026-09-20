import { createFileRoute } from "@tanstack/react-router";
import { LibraryPage } from "@/renderer/pages/library";

export const Route = createFileRoute("/library/albums/")({
  component: () => <LibraryPage presentation="albums" />,
});
