import { createFileRoute } from "@tanstack/react-router";
import { TracksPage } from "@/renderer/pages/library";

export const Route = createFileRoute("/library/tracks")({
  component: TracksPage,
});
