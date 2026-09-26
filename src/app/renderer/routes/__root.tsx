import { createRootRoute, retainSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import {
  albumArtistSortKeys,
  albumSortKeys,
  artistAlbumSortKeys,
  sortDirections,
  trackSortKeys,
} from "@/renderer/entities/library";
import { AppShell } from "@/app/renderer/ui/app-shell";

const direction = z.enum(sortDirections);

export const librarySearchSchema = z.object({
  albumsFilter: z.string().optional().default(""),
  albumsSort: z.enum(albumSortKeys).optional().default("title"),
  albumsDirection: direction.optional().default("ascending"),
  artistsFilter: z.string().optional().default(""),
  artistsSort: z.enum(albumArtistSortKeys).optional().default("artist"),
  artistsDirection: direction.optional().default("ascending"),
  artistAlbumsSort: z.enum(artistAlbumSortKeys).optional().default("year"),
  artistAlbumsDirection: direction.optional().default("ascending"),
  tracksFilter: z.string().optional().default(""),
  tracksSort: z.enum(trackSortKeys).optional().default("title"),
  tracksDirection: direction.optional().default("ascending"),
});

export const Route = createRootRoute({
  validateSearch: librarySearchSchema,
  search: { middlewares: [retainSearchParams(true)] },
  component: AppShell,
});
