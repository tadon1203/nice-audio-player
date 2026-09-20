import { z } from "zod";
import { IPC_CHANNELS } from "./channels";

export const ipcSchemas = {
  emptyArgs: z.tuple([]),
  nonEmptyString: z.string().min(1),
  nonNegativeInteger: z.number().int().nonnegative().safe(),
  finiteUnitInterval: z.number().finite().min(0).max(1),
  sortDirection: z.enum(["ascending", "descending"]),
} as const;

const albumKeySchema = z.object({ title: z.string().min(1), albumArtist: z.string().min(1) });
const artistKeySchema = z.object({ name: z.string().min(1) });
const cursorSchema = z.string().min(1).nullable();
const searchSchema = z.string().min(1).nullable();
const albumArtistSortKeySchema = z.enum(["artist", "albumCount", "trackCount"]);
const albumSortKeySchema = z.enum(["title", "artist", "year"]);
const artistAlbumSortKeySchema = z.enum(["year", "title"]);
const trackSortKeySchema = z.enum(["title", "artist", "album", "duration"]);

const artworkSchema = z.object({
  contentHash: z.string(),
  mimeType: z.enum(["jpeg", "png"]),
  relativePath: z.string(),
});
const validAudioFileSchema = z.object({
  path: z.string(),
  fileName: z.string(),
  extension: z.string(),
});
const outputSelectionSchema = z.union([
  z.object({ kind: z.literal("systemDefault") }),
  z.object({ kind: z.literal("device"), deviceId: z.string() }),
]);
const audioOutputDeviceIdentitySchema = z.object({ id: z.string(), name: z.string() });
const playbackChannelConversionSchema = z.enum(["none", "monoToStereo", "stereoToMono"]);
const playbackBaseSchema = {
  revision: z.number().int(),
  volume: ipcSchemas.finiteUnitInterval,
  muted: z.boolean(),
  outputSelection: outputSelectionSchema,
  canGoPrevious: z.boolean(),
  canGoNext: z.boolean(),
};
const playbackStateSchema = z.discriminatedUnion("status", [
  z.object({
    ...playbackBaseSchema,
    status: z.literal("stopped"),
    file: validAudioFileSchema.nullable(),
  }),
  z.object({
    ...playbackBaseSchema,
    status: z.enum(["playing", "paused"]),
    file: validAudioFileSchema,
    playbackId: z.string(),
    positionMs: ipcSchemas.nonNegativeInteger,
    durationMs: ipcSchemas.nonNegativeInteger.nullable(),
    outputDevice: audioOutputDeviceIdentitySchema,
    channelConversion: playbackChannelConversionSchema,
    sourceSampleRate: ipcSchemas.nonNegativeInteger,
    outputSampleRate: ipcSchemas.nonNegativeInteger,
    resamplingActive: z.boolean(),
  }),
  z.object({
    ...playbackBaseSchema,
    status: z.literal("failed"),
    file: validAudioFileSchema.nullable(),
    playbackId: z.string().nullable(),
    error: z.enum([
      "noOutputDevice",
      "outputDeviceUnavailable",
      "unsupportedOutputConfiguration",
      "outputStreamBuildFailed",
      "outputStreamStartFailed",
      "outputStreamPauseFailed",
      "outputStreamResumeFailed",
      "outputStreamRuntimeFailed",
      "completionTimingFailed",
      "decodeFailed",
      "sampleRateConversionFailed",
    ]),
  }),
]);
const playbackQueueItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string().nullable(),
  durationMs: ipcSchemas.nonNegativeInteger.nullable(),
});
const playbackQueueSchema = z.object({
  revision: z.number().int().nullable(),
  current: playbackQueueItemSchema.nullable(),
  upcoming: z.array(playbackQueueItemSchema),
  repeatMode: z.enum(["off", "all", "one"]),
  shuffleEnabled: z.boolean(),
});
const libraryRootSchema = z.object({
  id: z.string(),
  path: z.string(),
  enabled: z.boolean(),
  scanGeneration: z.number().int().nullable(),
  lastSuccessfulScanAtMs: z.number().nullable(),
});
const libraryScanStateSchema = z.enum(["idle", "running", "completed", "cancelled", "failed"]);
const libraryScanSnapshotSchema = z.object({
  state: libraryScanStateSchema,
  currentRoot: libraryRootSchema.nullable(),
  discoveredCount: z.number().nullable(),
  inspectedCount: z.number().nullable(),
  indexedCount: z.number().nullable(),
  failedCount: z.number().nullable(),
  failureCode: z.string().nullable(),
});
const libraryStatusSchema = z.union([
  z.object({ status: z.literal("ready") }),
  z.object({
    status: z.literal("unavailable"),
    reason: z.enum([
      "storageUnavailable",
      "databaseOpenFailed",
      "migrationFailed",
      "schemaTooNew",
      "databaseCorrupt",
    ]),
  }),
]);
const albumSummarySchema = z.object({
  key: albumKeySchema,
  artwork: artworkSchema.nullable(),
  year: z.number().int().nullable(),
});
const albumArtistSummarySchema = z.object({
  key: artistKeySchema,
  artwork: artworkSchema.nullable(),
  albumCount: z.number().int().nullable(),
  trackCount: z.number().int().nullable(),
});
const trackSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string().nullable(),
  album: z.string().nullable(),
  albumArtist: z.string().nullable(),
  artwork: artworkSchema.nullable(),
  durationMs: ipcSchemas.nonNegativeInteger.nullable(),
  availability: z.enum(["available", "missing"]),
  playable: z.boolean(),
});
const albumTrackSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string().nullable(),
  trackNumber: z.number().int().nullable(),
  discNumber: z.number().int().nullable(),
  fileFormat: z.string().nullable(),
  bitDepth: z.number().int().nullable(),
  sampleRate: z.number().int().nullable(),
  durationMs: ipcSchemas.nonNegativeInteger.nullable(),
  availability: z.enum(["available", "missing"]),
  playable: z.boolean(),
});
const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    totalCount: z.number().nullable(),
    nextCursor: z.string().nullable(),
  });
const albumDetailsSchema = z.object({
  summary: albumSummarySchema,
  date: z.string().nullable(),
  trackCount: z.number().nullable(),
  durationMs: z.number().nullable(),
  firstPlayableTrackId: z.string().nullable(),
});
const albumTrackPageSchema = z.object({
  items: z.array(albumTrackSummarySchema),
  totalCount: z.number(),
  nextCursor: z.string().nullable(),
});

export const ipcRequestSchemas = {
  [IPC_CHANNELS.playback.getState]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.playback.getQueue]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.playback.pause]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.playback.resume]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.playback.previous]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.playback.next]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.playback.seek]: z.tuple([ipcSchemas.nonNegativeInteger]),
  [IPC_CHANNELS.playback.setVolume]: z.tuple([ipcSchemas.finiteUnitInterval]),
  [IPC_CHANNELS.playback.setMuted]: z.tuple([z.boolean()]),
  [IPC_CHANNELS.platform.selectLibraryDirectory]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.library.status]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.library.roots]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.library.registerRoot]: z.tuple([ipcSchemas.nonEmptyString]),
  [IPC_CHANNELS.library.setRootEnabled]: z.tuple([ipcSchemas.nonEmptyString, z.boolean()]),
  [IPC_CHANNELS.library.removeRoot]: z.tuple([ipcSchemas.nonEmptyString]),
  [IPC_CHANNELS.library.scan]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.library.startScan]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.library.cancelScan]: ipcSchemas.emptyArgs,
  [IPC_CHANNELS.library.listTracks]: z.tuple([
    cursorSchema,
    searchSchema,
    trackSortKeySchema,
    ipcSchemas.sortDirection,
  ]),
  [IPC_CHANNELS.library.listAlbums]: z.tuple([
    cursorSchema,
    searchSchema,
    albumSortKeySchema,
    ipcSchemas.sortDirection,
  ]),
  [IPC_CHANNELS.library.listAlbumArtists]: z.tuple([
    cursorSchema,
    searchSchema,
    albumArtistSortKeySchema,
    ipcSchemas.sortDirection,
  ]),
  [IPC_CHANNELS.library.getAlbumArtist]: z.tuple([artistKeySchema]),
  [IPC_CHANNELS.library.listArtistAlbums]: z.tuple([
    artistKeySchema,
    cursorSchema,
    artistAlbumSortKeySchema,
    ipcSchemas.sortDirection,
  ]),
  [IPC_CHANNELS.library.getAlbumDetails]: z.tuple([albumKeySchema]),
  [IPC_CHANNELS.library.listAlbumTracks]: z.tuple([albumKeySchema, cursorSchema]),
  [IPC_CHANNELS.library.getTrackForPath]: z.tuple([ipcSchemas.nonEmptyString]),
  [IPC_CHANNELS.playback.startTrack]: z.tuple([ipcSchemas.nonEmptyString]),
  [IPC_CHANNELS.playback.startAlbum]: z.tuple([albumKeySchema]),
} as const;

export const ipcResponseSchemas = {
  [IPC_CHANNELS.playback.getState]: playbackStateSchema,
  [IPC_CHANNELS.playback.getQueue]: playbackQueueSchema,
  [IPC_CHANNELS.playback.pause]: playbackStateSchema,
  [IPC_CHANNELS.playback.resume]: playbackStateSchema,
  [IPC_CHANNELS.playback.previous]: playbackStateSchema,
  [IPC_CHANNELS.playback.next]: playbackStateSchema,
  [IPC_CHANNELS.playback.seek]: playbackStateSchema,
  [IPC_CHANNELS.playback.setVolume]: playbackStateSchema,
  [IPC_CHANNELS.playback.setMuted]: playbackStateSchema,
  [IPC_CHANNELS.platform.selectLibraryDirectory]: z.string().nullable(),
  [IPC_CHANNELS.library.status]: libraryStatusSchema,
  [IPC_CHANNELS.library.roots]: z.array(libraryRootSchema),
  [IPC_CHANNELS.library.registerRoot]: libraryRootSchema,
  [IPC_CHANNELS.library.setRootEnabled]: libraryRootSchema,
  [IPC_CHANNELS.library.removeRoot]: z.undefined(),
  [IPC_CHANNELS.library.scan]: libraryScanSnapshotSchema,
  [IPC_CHANNELS.library.startScan]: z.undefined(),
  [IPC_CHANNELS.library.cancelScan]: z.undefined(),
  [IPC_CHANNELS.library.listTracks]: pageSchema(trackSummarySchema),
  [IPC_CHANNELS.library.listAlbums]: pageSchema(albumSummarySchema),
  [IPC_CHANNELS.library.listAlbumArtists]: pageSchema(albumArtistSummarySchema),
  [IPC_CHANNELS.library.getAlbumArtist]: albumArtistSummarySchema,
  [IPC_CHANNELS.library.listArtistAlbums]: pageSchema(albumSummarySchema),
  [IPC_CHANNELS.library.getAlbumDetails]: albumDetailsSchema,
  [IPC_CHANNELS.library.listAlbumTracks]: albumTrackPageSchema,
  [IPC_CHANNELS.library.getTrackForPath]: trackSummarySchema.nullable(),
  [IPC_CHANNELS.playback.startTrack]: playbackStateSchema,
  [IPC_CHANNELS.playback.startAlbum]: playbackStateSchema,
} as const satisfies Record<keyof typeof ipcRequestSchemas, z.ZodType>;

export const ipcEventSchemas = {
  "app:event": z.discriminatedUnion("event", [
    z.object({ event: z.literal("playbackStateChanged"), payload: playbackStateSchema }),
    z.object({ event: z.literal("playbackQueueStateChanged"), payload: playbackQueueSchema }),
    z.object({ event: z.literal("libraryScanStateChanged"), payload: libraryScanSnapshotSchema }),
  ]),
} as const;

export const ipcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export const ipcResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), error: ipcErrorSchema }),
]);

export type ArtworkMimeType = z.infer<typeof artworkSchema>["mimeType"];
export type ArtworkRef = z.infer<typeof artworkSchema>;
export type AudioOutputDeviceIdentity = z.infer<typeof audioOutputDeviceIdentitySchema>;
export type AudioOutputSelection = z.infer<typeof outputSelectionSchema>;
export type LibraryAlbumArtistKey = z.infer<typeof artistKeySchema>;
export type LibraryAlbumKey = z.infer<typeof albumKeySchema>;
export type LibraryAlbumArtistSortKey = z.infer<typeof albumArtistSortKeySchema>;
export type LibraryAlbumSortKey = z.infer<typeof albumSortKeySchema>;
export type LibraryArtistAlbumSortKey = z.infer<typeof artistAlbumSortKeySchema>;
export type LibraryTrackSortKey = z.infer<typeof trackSortKeySchema>;
export type LibrarySortDirection = z.infer<typeof ipcSchemas.sortDirection>;
export type LibraryFileAvailability = z.infer<typeof trackSummarySchema>["availability"];
export type LibraryUnavailableReason = Extract<
  z.infer<typeof libraryStatusSchema>,
  { status: "unavailable" }
>["reason"];
export type LibraryStatus = z.infer<typeof libraryStatusSchema>;
export type LibraryRoot = z.infer<typeof libraryRootSchema>;
export type LibraryScanState = z.infer<typeof libraryScanStateSchema>;
export type LibraryScanSnapshot = z.infer<typeof libraryScanSnapshotSchema>;
export type LibraryAlbumSummary = z.infer<typeof albumSummarySchema>;
export type LibraryAlbumArtistSummary = z.infer<typeof albumArtistSummarySchema>;
export type LibraryTrackSummary = z.infer<typeof trackSummarySchema>;
export type LibraryAlbumArtistPage = z.infer<
  (typeof ipcResponseSchemas)[typeof IPC_CHANNELS.library.listAlbumArtists]
>;
export type LibraryAlbumPage = z.infer<
  (typeof ipcResponseSchemas)[typeof IPC_CHANNELS.library.listAlbums]
>;
export type LibraryTrackPage = z.infer<
  (typeof ipcResponseSchemas)[typeof IPC_CHANNELS.library.listTracks]
>;
export type LibraryAlbumDetails = z.infer<typeof albumDetailsSchema>;
export type LibraryAlbumTrackSummary = z.infer<typeof albumTrackSummarySchema>;
export type LibraryAlbumTrackPage = z.infer<typeof albumTrackPageSchema>;
export type PlaybackFailureCode = Extract<
  z.infer<typeof playbackStateSchema>,
  { status: "failed" }
>["error"];
export type PlaybackChannelConversion = z.infer<typeof playbackChannelConversionSchema>;
export type PlaybackQueueItem = z.infer<typeof playbackQueueItemSchema>;
export type PlaybackRepeatMode = z.infer<typeof playbackQueueSchema>["repeatMode"];
export type PlaybackQueue = z.infer<typeof playbackQueueSchema>;
export type ValidatedAudioFile = z.infer<typeof validAudioFileSchema>;
export type PlaybackState = z.infer<typeof playbackStateSchema>;
export type IpcError = z.infer<typeof ipcErrorSchema>;
export type IpcChannel = keyof typeof ipcRequestSchemas;
export type IpcRequestMap = {
  [Channel in IpcChannel]: z.infer<(typeof ipcRequestSchemas)[Channel]>;
};
export type IpcResponseMap = {
  [Channel in IpcChannel]: z.infer<(typeof ipcResponseSchemas)[Channel]>;
};
export type IpcInvokeEvents = {
  [Channel in IpcChannel]: {
    readonly args: IpcRequestMap[Channel];
    readonly response: IpcResponseMap[Channel];
  };
};
export type IpcResult<T> =
  | Exclude<z.infer<typeof ipcResultSchema>, { ok: true }>
  | { readonly ok: true; readonly value: T };
export type AppEvent = z.infer<(typeof ipcEventSchemas)["app:event"]>;
