import { createRootRoute, retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/app/renderer/ui/app-shell";

const direction = z.enum(["ascending", "descending"]);

export const librarySearchSchema = z.object({
  albumsFilter: z.string().optional().default(""),
  albumsSort: z.enum(["title", "artist", "year"]).optional().default("title"),
  albumsDirection: direction.optional().default("ascending"),
  artistsFilter: z.string().optional().default(""),
  artistsSort: z.enum(["artist", "albumCount", "trackCount"]).optional().default("artist"),
  artistsDirection: direction.optional().default("ascending"),
  artistAlbumsSort: z.enum(["year", "title"]).optional().default("year"),
  artistAlbumsDirection: direction.optional().default("ascending"),
  tracksFilter: z.string().optional().default(""),
  tracksSort: z.enum(["title", "artist", "album", "duration"]).optional().default("title"),
  tracksDirection: direction.optional().default("ascending"),
});

export const Route = createRootRoute({
  validateSearch: librarySearchSchema,
  search: { middlewares: [retainSearchParams(true)] },
  component: AppShell,
});
