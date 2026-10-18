import type {
  Appearance,
  AudioOutputSelection,
  InitialState,
  SessionStartedBy,
  LibraryAlbumArtistSummary,
  LibraryAlbumDetails,
  LibraryAlbumSummary,
  LibraryAlbumTrackPage,
  LibraryRoot,
  LibraryScanSnapshot,
  LibraryScanState,
  LibraryTrackSummary,
  PlaybackItem,
  PlaybackQueueItem,
  PlaybackQueueSnapshot,
  PlaybackSnapshot,
} from "#lib/native";

/** Plain data the fake backend serves. No rule lives here: tests say what a page contains. */
export interface LibraryData {
  roots: LibraryRoot[];
  tracks: LibraryTrackSummary[];
  albums: LibraryAlbumSummary[];
  artists: LibraryAlbumArtistSummary[];
  albumDetails: LibraryAlbumDetails;
  albumTracks: LibraryAlbumTrackPage;
}

export const testRoot: LibraryRoot = {
  id: "root-1",
  path: "C:/Music",
  enabled: true,
  scanGeneration: 0,
  lastSuccessfulScanAtMs: null,
  trackCount: 0,
  missingCount: 0,
};

const testArtistId = "9f1c0e4b7a2d4c3e8b5a6f7e8d9c0b1a";
const extraArtistId = "3d2c1b0a9f8e7d6c5b4a39281706f5e4";

const testAlbumId = "5a1b2c3d4e5f60718293a4b5c6d7e8f9";
const secondAlbumId = "6b2c3d4e5f60718293a4b5c6d7e8f9a0";

export const testAlbum: LibraryAlbumSummary = {
  id: testAlbumId,
  title: "Test album",
  albumArtist: { id: testArtistId, name: "Test artist" },
  artwork: null,
  year: 2020,
};
export const secondAlbum: LibraryAlbumSummary = {
  id: secondAlbumId,
  title: "Second album",
  albumArtist: { id: testArtistId, name: "Test artist" },
  artwork: null,
  year: 2024,
};

export const ARTWORK = {
  hash: "ab".repeat(32),
  mimeType: "png",
} as const;

/** Track 1 is "Test track", track 5 is missing on disk, the rest are "Track 00N". */
export function makeTracks(
  count = 140,
  options: { artwork?: boolean } = {},
): LibraryTrackSummary[] {
  return Array.from({ length: count }, (_, index): LibraryTrackSummary => {
    const missing = index === 4;
    return {
      id: index + 1,
      title:
        index === 0
          ? "Test track"
          : missing
            ? "Missing track"
            : `Track ${String(index + 1).padStart(3, "0")}`,
      artist: "Test artist",
      album: {
        id: testAlbumId,
        title: "Test album",
        artist: { id: testArtistId, name: "Test artist" },
      },
      artwork: options.artwork ? ARTWORK : null,
      durationMs: 120_000 + index * 1_000,
      fileFormat: "FLAC",
      bitDepth: 24,
      bitrateKbps: null,
      state: missing ? "missing" : "playable",
    };
  });
}

export function pageOf<T>(
  items: T[],
  cursor: string | null,
  size = 40,
): { items: T[]; totalCount: number; nextCursor: string | null } {
  const start = cursor === null ? 0 : Number(cursor);
  const slice = items.slice(start, start + size);
  const next = start + slice.length;
  return {
    items: slice,
    totalCount: items.length,
    nextCursor: next < items.length ? String(next) : null,
  };
}

export function testLibrary(
  options: { trackCount?: number; extraAlbums?: number; artwork?: boolean } = {},
): LibraryData {
  const tracks = makeTracks(options.trackCount ?? 140, { artwork: options.artwork });
  const artwork = options.artwork ? ARTWORK : null;
  const albumOf = (album: LibraryAlbumSummary): LibraryAlbumSummary => ({ ...album, artwork });
  const extra = Array.from(
    { length: options.extraAlbums ?? 0 },
    (_, index): LibraryAlbumSummary => ({
      id: `e${String(index).padStart(31, "0")}`,
      title: `Extra album ${String(index).padStart(4, "0")}`,
      albumArtist: { id: extraArtistId, name: "Extra artist" },
      artwork,
      year: 2000 + (index % 20),
    }),
  );
  return {
    roots: [testRoot],
    tracks,
    albums: [albumOf(testAlbum), albumOf(secondAlbum), ...extra],
    artists: [
      {
        id: testArtistId,
        name: "Test artist",
        artwork,
        albumCount: 2,
        trackCount: tracks.length,
      },
    ],
    albumDetails: {
      summary: albumOf(testAlbum),
      date: "2020",
      trackCount: 3,
      durationMs: 421_000,
      firstPlayableTrackId: tracks[0]?.id ?? null,
    },
    albumTracks: {
      items: [tracks[0]!, tracks[1]!, tracks[4]!].map((track, index) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        trackNumber: index + 1,
        discNumber: null,
        fileFormat: "FLAC",
        bitDepth: 24,
        sampleRate: 96_000,
        durationMs: track.durationMs,
        state: track.state,
      })),
      totalCount: 3,
      nextCursor: null,
    },
  };
}

/** Pages exactly as given: a search or sort the test cares about replaces the command. */
export function libraryResponses(library: LibraryData = testLibrary()): Record<string, unknown> {
  return {
    listLibraryRoots: library.roots,
    listLibraryTracks: ({
      request,
    }: {
      request: { cursor: string | null };
    }): { items: LibraryTrackSummary[]; totalCount: number; nextCursor: string | null } =>
      pageOf(library.tracks, request.cursor),
    listLibraryAlbums: (): {
      items: LibraryAlbumSummary[];
      totalCount: number;
      nextCursor: string | null;
    } => pageOf(library.albums, null, library.albums.length),
    listLibraryAlbumArtists: (): {
      items: LibraryAlbumArtistSummary[];
      totalCount: number;
      nextCursor: string | null;
    } => pageOf(library.artists, null),
    listLibraryTrackIndex: [],
    listLibraryAlbumIndex: [],
    listLibraryAlbumArtistIndex: [],
    getLibraryArtist: library.artists[0],
    listLibraryArtistAlbums: (): {
      items: LibraryAlbumSummary[];
      totalCount: number;
      nextCursor: string | null;
    } => pageOf(library.albums.slice(0, 2), null),
    getLibraryAlbum: library.albumDetails,
    listLibraryAlbumTracks: library.albumTracks,
    getLibraryTrackProperties: ({
      trackId: id,
    }: {
      trackId: number;
    }): {
      id: number;
      path: string;
      fileName: string;
      title: string;
      artist: string | null;
      album: string | null;
      albumArtist: string | null;
      trackNumber: number;
      trackTotal: number;
      discNumber: null;
      discTotal: null;
      genre: string;
      date: string;
      durationMs: number | null;
      fileFormat: string | null;
      codec: string;
      sampleRate: number;
      channelCount: number;
      bitDepth: number | null;
      bitrateKbps: number | null;
    } => {
      const track = library.tracks.find((entry) => entry.id === id);
      if (track === undefined) throw { code: "common", error: { code: "trackNotFound" } };
      return {
        id,
        path: `C:/Music/${track.title}.flac`,
        fileName: `${track.title}.flac`,
        title: track.title,
        artist: track.artist,
        album: track.album?.title ?? null,
        albumArtist: track.album?.artist.name ?? null,
        trackNumber: 3,
        trackTotal: 11,
        discNumber: null,
        discTotal: null,
        genre: "Electronic",
        date: "2019-05-03",
        durationMs: track.durationMs,
        fileFormat: track.fileFormat,
        codec: "flac",
        sampleRate: 96_000,
        channelCount: 2,
        bitDepth: track.bitDepth,
        bitrateKbps: track.bitrateKbps,
      };
    },
    revealLibraryTrack: null,
  };
}

export const outputDevices = [
  { id: "speakers", name: "Speakers", isDefault: true },
  { id: "headphones", name: "Headphones", isDefault: false },
];

export const idleScan: LibraryScanSnapshot = {
  state: "idle",
  currentRoot: null,
  expectedCount: 0,
  discoveredCount: 0,
  inspectedCount: 0,
  indexedCount: 0,
  failedCount: 0,
  failureCode: null,
  finishedCount: 0,
  changedCount: 0,
};

/** A scan snapshot in a state, with the counts a scan in that state would show. */
export function scanSnapshot(state: LibraryScanState): LibraryScanSnapshot {
  if (state === "idle") return idleScan;
  return {
    state,
    currentRoot: state === "running" ? testRoot : null,
    expectedCount: 40,
    discoveredCount: 20,
    inspectedCount: state === "running" ? 8 : 20,
    indexedCount: state === "running" ? 6 : 18,
    failedCount: state === "failed" ? 2 : 0,
    failureCode: state === "failed" ? "rootTraversalFailed" : null,
    finishedCount: state === "running" ? 0 : 1,
    changedCount: 20,
  };
}

export const defaultSettings: Appearance = { artworkBackdrop: true, calmMotion: false };

export const stoppedPlayback: PlaybackSnapshot = {
  status: "stopped",
  base: {
    volume: 0.72,
    muted: false,
    outputSelection: { kind: "systemDefault" },
    canGoPrevious: false,
    canGoNext: false,
  },
  item: null,
};

export const emptyQueue: PlaybackQueueSnapshot = {
  current: null,
  history: [],
  historyCount: 0,
  upcoming: [],
  upcomingCount: 0,
  repeatMode: "off",
  shuffleEnabled: false,
  canRestorePrevious: false,
};

/** A Meter frame as the backend sends it (35 little-endian 32-bit words, see `MeterFrames.decode`). */
export function meterFrameBytes({
  band = -90,
  peak = [-90, -90],
  rms = [-90, -90],
  fullScale = false,
}: {
  band?: number;
  peak?: [number, number];
  rms?: [number, number];
  fullScale?: boolean;
} = {}): number[] {
  const view = new DataView(new ArrayBuffer(35 * 4));
  [...Array.from({ length: 30 }, () => band), ...peak, ...rms].forEach((value, i) =>
    view.setFloat32(i * 4, value, true),
  );
  view.setUint32(34 * 4, fullScale ? 1 : 0, true);
  return Array.from(new Uint8Array(view.buffer));
}

/** The state an app holds before anything plays: what `connect` answers first. */
export function idleInitialState(): InitialState {
  return {
    playback: { revision: 1, value: stoppedPlayback },
    queue: { revision: 1, value: emptyQueue },
    libraryScan: { revision: 0, value: idleScan },
    waveform: { revision: 0, value: null },
    appearance: { revision: 0, value: defaultSettings },
  };
}

/** What an app answers before anything plays. */
export function idleResponses(): {
  subscribeMeterFrames: () => number;
  unsubscribeMeterFrames: null;
  getPlaybackQueueWindow: ({ offset }: { offset: number }) => {
    revision: number;
    offset: number;
    items: never[];
  };
  getPlaybackWaveform: { revision: number; value: null };
  listAudioOutputDevices: { id: string; name: string; isDefault: boolean }[];
  getLibraryStatus: { status: "ready" };
  getTrackLyrics: ({ trackId }: { trackId: number }) => { status: "notFound"; trackId: number };
  getArtworkAccent: null;
} {
  let nextMeterSubscription = 1;
  return {
    subscribeMeterFrames: (): number => nextMeterSubscription++,
    unsubscribeMeterFrames: null,
    getPlaybackQueueWindow: ({
      offset,
    }: {
      offset: number;
    }): { revision: number; offset: number; items: never[] } => ({
      revision: 1,
      offset,
      items: [],
    }),
    getPlaybackWaveform: { revision: 0, value: null },
    listAudioOutputDevices: outputDevices,
    getLibraryStatus: { status: "ready" as const },
    getTrackLyrics: ({
      trackId,
    }: {
      trackId: number;
    }): { status: "notFound"; trackId: number } => ({
      status: "notFound" as const,
      trackId,
    }),
    getArtworkAccent: null,
  };
}

export const queueItemFor = (track: LibraryTrackSummary): PlaybackQueueItem => ({
  queueItemId: track.id,
  id: track.id,
  title: track.title,
  artist: track.artist,
  album: track.album?.title ?? null,
  artwork: track.artwork,
  durationMs: track.durationMs,
});

export function playbackItemFor(track: LibraryTrackSummary): PlaybackItem {
  return {
    ...queueItemFor(track),
    // A count of 0 is below every track number, so Now Playing shows "Track n" with no total.
    album: track.album === null ? null : { ...track.album, trackCount: 0 },
    trackNumber: track.id % 12 || null,
    discNumber: null,
    year: 2019,
  };
}

interface PlayingFields {
  status: "playing" | "paused";
  item: PlaybackItem;
  startedBy: SessionStartedBy;
  positionMs: number;
  seekRevision: number;
  volume: number;
  muted: boolean;
  outputSelection: AudioOutputSelection;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export const playbackIdOf = (item: PlaybackItem): number => item.id;

export function playingSnapshot(fields: PlayingFields): PlaybackSnapshot {
  const device =
    fields.outputSelection.kind === "device"
      ? outputDevices.find(
          (item) => item.id === (fields.outputSelection as { deviceId: string }).deviceId,
        )
      : outputDevices.find((item) => item.isDefault);
  return {
    status: fields.status,
    base: {
      volume: fields.volume,
      muted: fields.muted,
      outputSelection: fields.outputSelection,
      canGoPrevious: fields.canGoPrevious,
      canGoNext: fields.canGoNext,
    },
    session: {
      item: fields.item,
      startedBy: fields.startedBy,
      playbackId: playbackIdOf(fields.item),
      positionMs: fields.positionMs,
      seekRevision: fields.seekRevision,
      durationMs: fields.item.durationMs,
      outputDevice: { id: device?.id ?? "default", name: device?.name ?? "System default" },
      channelConversion: "none",
      sourceFormat: "FLAC",
      sourceBitDepth: 24,
      sourceBitrateKbps: null,
      sourceSampleRate: 44_100,
      outputSampleRate: 48_000,
      resamplingActive: true,
    },
  };
}

/** The playable tracks of the library's one album, in order: what Play album should start. */
export function albumSequence(library: LibraryData): LibraryTrackSummary[] {
  return library.albumTracks.items.flatMap((item) =>
    library.tracks.filter((track) => track.id === item.id && track.state === "playable"),
  );
}
