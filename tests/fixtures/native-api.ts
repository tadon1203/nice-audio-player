import type { Page } from "@playwright/test";
import type {
  AppEvent,
  AudioOutputSelection,
  LibraryAlbumArtistSummary,
  LibraryAlbumDetails,
  LibraryAlbumTrackPage,
  LibraryRoot,
  LibraryScanSnapshot,
  LibraryScanState,
  LibraryTrackSummary,
  LyricsResolution,
  PlaybackItem,
  PlaybackQueueItem,
  PlaybackQueueSnapshot,
  PlaybackSnapshot,
  Settings,
  TNativeAPI,
} from "$lib/native";

type NativeTestState = {
  getRequestCount: (kind: string) => number;
  /** Replaces what `getTrackLyrics` returns for a track; other tracks answer `notFound`. */
  setLyrics: (trackId: string, resolution: LyricsResolution | { fail: string }) => void;
  /** Replaces the color `getArtworkAccent` returns for a content hash. */
  setArtworkAccent: (contentHash: string, color: string | null) => void;
  /** Makes `getPlaybackWaveform` return a waveform and emits `waveformReady` for the loaded file. */
  publishWaveform: () => void;
  setScanState: (state: LibraryScanState) => void;
  /**
   * Replaces commands of the mock (run it with `page.evaluate`); every command the app can call
   * already has a default, so a test only names the ones it wants to behave differently.
   */
  overrideApi: (overrides: Partial<TNativeAPI>) => void;
  startPlaybackTicks: () => void;
  stopPlaybackTicks: () => void;
};

type InstallNativeApiOptions = {
  failPlaybackInitialization?: boolean;
  failAlbumDetails?: boolean;
  failAlbumTracks?: boolean;
  failArtistDetails?: boolean;
  failArtistAlbums?: boolean;
  libraryUnavailable?: boolean;
  /** Albums to list in addition to the two named ones (a long library). */
  extraAlbums?: number;
  /** Tracks in the library (default 140). */
  trackCount?: number;
  /** Gives every track the same artwork (served at `ARTWORK_URL`), so Light and Sleeve draw. */
  artwork?: boolean;
};

declare global {
  interface Window {
    __niceAudioPlayerTest?: NativeTestState;
  }
}

export async function installNativeApi(page: Page, options: InstallNativeApiOptions = {}) {
  await page.addInitScript(createNativeMock, options);
}

/**
 * The whole mock backend. It runs in the page, so it only uses what it defines itself (imports
 * above are types). `api` is typed `TNativeAPI`: a command added to the app without a default
 * here fails the typecheck.
 */
function createNativeMock(options: InstallNativeApiOptions) {
  const root: LibraryRoot = {
    id: "root-1",
    path: "C:/Music",
    enabled: true,
    scanGeneration: 0,
    lastSuccessfulScanAtMs: null,
  };
  let roots = [root];
  const lyricsByTrack = new Map<string, LyricsResolution | { fail: string }>();
  const accentByHash = new Map<string, string | null>();
  const listeners = new Set<(event: AppEvent) => void>();
  const requestCounts: Record<string, number> = {};
  const recordRequest = (kind: string) => {
    requestCounts[kind] = (requestCounts[kind] ?? 0) + 1;
  };

  const tracks: LibraryTrackSummary[] = Array.from(
    { length: options.trackCount ?? 140 },
    (_, index) => {
      const missing = index === 4;
      return {
        id: missing ? "track-missing" : `track-${index + 1}`,
        title:
          index === 0
            ? "Test track"
            : missing
              ? "Missing track"
              : `Track ${String(index + 1).padStart(3, "0")}`,
        artist: "Test artist",
        album: "Test album",
        albumArtist: "Test artist",
        albumKey: { title: "Test album", albumArtist: "Test artist" },
        artwork: options.artwork
          ? {
              contentHash: "ab".repeat(32),
              mimeType: "png",
              relativePath: `artwork/ab/${"ab".repeat(32)}.png`,
            }
          : null,
        durationMs: 120_000 + index * 1_000,
        fileFormat: "FLAC",
        bitDepth: 24,
        bitrateKbps: null,
        availability: missing ? "missing" : "available",
        playable: !missing,
      };
    },
  );
  const albumSummary = {
    key: { title: "Test album", albumArtist: "Test artist" },
    artwork: null,
    year: 2020,
  } as const;
  const secondaryAlbum = {
    key: { title: "Second album", albumArtist: "Test artist" },
    artwork: null,
    year: 2024,
  } as const;
  const artist: LibraryAlbumArtistSummary = {
    key: { name: "Test artist" },
    artwork: null,
    albumCount: 2,
    trackCount: tracks.length,
  };
  const albumDetails: LibraryAlbumDetails = {
    summary: albumSummary,
    date: "2020",
    trackCount: 3,
    durationMs: 421_000,
    firstPlayableTrackId: tracks[0]?.id ?? null,
  };
  const albumTracks: LibraryAlbumTrackPage = {
    items: [tracks[0]!, tracks[1]!, tracks[4]!].map((track, index) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      trackNumber: index + 1,
      discNumber: null,
      fileFormat: "FLAC",
      bitDepth: 24,
      sampleRate: 96_000,
      durationMs: track.durationMs,
      availability: track.availability,
      playable: track.playable,
    })),
    totalCount: 3,
    nextCursor: null,
  };

  const fileFor = (track: LibraryTrackSummary) => ({
    path: `C:/Music/${track.id}.flac`,
    fileName: `${track.title}.flac`,
    extension: "flac",
  });
  const outputDevices = [
    { id: "speakers", name: "Speakers", isDefault: true },
    { id: "headphones", name: "Headphones", isDefault: false },
  ];
  let outputSelection: AudioOutputSelection = { kind: "systemDefault" };
  const outputDeviceFor = (selection: AudioOutputSelection) => {
    const device =
      selection.kind === "device"
        ? outputDevices.find((item) => item.id === selection.deviceId)
        : outputDevices.find((item) => item.isDefault);
    return { id: device?.id ?? "default", name: device?.name ?? "System default" };
  };
  let waveformReady = false;
  let playbackRevision = 50;
  let queueRevision = 1;
  let currentTrack: LibraryTrackSummary | null = null;
  let currentSequence: LibraryTrackSummary[] = [];
  let mock = {
    status: "stopped" as "stopped" | "playing" | "paused",
    item: null as PlaybackItem | null,
    positionMs: 0,
    seekRevision: 0,
    durationMs: null as number | null,
    volume: 0.72,
    muted: false,
    canGoPrevious: false,
    canGoNext: false,
  };
  const snapshotOf = (): PlaybackSnapshot => {
    const base = {
      revision: playbackRevision,
      volume: mock.volume,
      muted: mock.muted,
      outputSelection,
      canGoPrevious: mock.canGoPrevious,
      canGoNext: mock.canGoNext,
    };
    if (mock.status === "stopped" || mock.item === null) {
      return { status: "stopped", base, item: mock.item };
    }
    return {
      status: mock.status,
      base,
      session: {
        item: mock.item,
        playbackId: `playback-${mock.item.trackId}`,
        positionMs: mock.positionMs,
        seekRevision: mock.seekRevision,
        durationMs: mock.durationMs,
        outputDevice: outputDeviceFor(outputSelection),
        channelConversion: "none",
        sourceFormat: "FLAC",
        sourceBitDepth: 24,
        sourceBitrateKbps: null,
        sourceSampleRate: 44_100,
        outputSampleRate: 48_000,
        resamplingActive: true,
      },
    };
  };
  let playback: PlaybackSnapshot = snapshotOf();
  // Kept whole here; `wire` cuts it down to what the real backend puts in a snapshot.
  let queue: Omit<PlaybackQueueSnapshot, "history" | "historyCount" | "upcomingCount"> = {
    revision: queueRevision,
    current: null,
    upcoming: [],
    repeatMode: "off",
    shuffleEnabled: false,
  };
  const wire = (whole: typeof queue): PlaybackQueueSnapshot => {
    const index = currentSequence.findIndex((track) => track.id === whole.current?.id);
    const played = index > 0 ? currentSequence.slice(0, index).map(queueItemFor) : [];
    return {
      ...whole,
      history: played.slice(-50),
      historyCount: played.length,
      upcoming: whole.upcoming.slice(0, 200),
      upcomingCount: whole.upcoming.length,
    };
  };
  const emit = (event: AppEvent) => listeners.forEach((listener) => listener(event));
  const publishPlayback = () => emit({ event: "playbackStateChanged", payload: playback });
  /** Applies a change to the mock player and publishes it as a new revision. */
  const commit = (change: Partial<typeof mock>) => {
    playbackRevision += 1;
    mock = { ...mock, ...change };
    playback = snapshotOf();
    publishPlayback();
    return playback;
  };
  let playbackTicker: ReturnType<typeof setInterval> | null = null;
  const startPlaybackTicks = () => {
    if (playbackTicker !== null) return;
    playbackTicker = setInterval(() => {
      if (mock.status !== "playing") return;
      commit({
        positionMs: Math.min(mock.positionMs + 250, mock.durationMs ?? mock.positionMs + 250),
      });
    }, 10);
  };
  const stopPlaybackTicks = () => {
    if (playbackTicker === null) return;
    clearInterval(playbackTicker);
    playbackTicker = null;
  };
  const queueItemFor = (track: LibraryTrackSummary): PlaybackQueueItem => ({
    id: track.id,
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
    durationMs: track.durationMs,
  });
  const setTrack = (track: LibraryTrackSummary, sequence: LibraryTrackSummary[] = [track]) => {
    currentTrack = track;
    currentSequence = sequence.filter((item) => item.playable && item.availability === "available");
    const index = Math.max(
      0,
      currentSequence.findIndex((item) => item.id === track.id),
    );
    const upcoming = currentSequence.slice(index + 1);
    queueRevision += 1;
    queue = {
      revision: queueRevision,
      current: queueItemFor(track),
      upcoming: upcoming.map(queueItemFor),
      repeatMode: queue.repeatMode,
      shuffleEnabled: queue.shuffleEnabled,
    };
    emit({ event: "playbackQueueStateChanged", payload: wire(queue) });
    const { id: queueItemId, ...identity } = queueItemFor(track);
    return commit({
      status: "playing",
      item: {
        ...identity,
        queueItemId,
        file: fileFor(track),
        albumArtist: track.albumArtist,
        trackNumber: Number(track.id.replace(/\D/g, "")) % 12 || null,
        discNumber: null,
        year: 2019,
        albumKey: track.album
          ? { title: track.album, albumArtist: track.albumArtist ?? track.artist ?? "" }
          : null,
        albumTrackCount: null,
      },
      positionMs: 12_000,
      durationMs: track.durationMs,
      canGoPrevious: index > 0,
      canGoNext: index < currentSequence.length - 1,
    });
  };
  let settings: Settings = { appearance: { artworkBackdrop: true } };
  const scanRoot = (): LibraryRoot | null => roots.find((item) => item.enabled) ?? null;
  let scan: LibraryScanSnapshot = {
    state: "idle",
    currentRoot: null,
    expectedCount: 0,
    discoveredCount: 0,
    inspectedCount: 0,
    indexedCount: 0,
    failedCount: 0,
    failureCode: null,
  };
  const setScanState = (state: LibraryScanState) => {
    scan = {
      state,
      currentRoot: state === "running" ? scanRoot() : null,
      expectedCount: state === "idle" ? 0 : 40,
      discoveredCount: state === "idle" ? 0 : 20,
      inspectedCount: state === "idle" ? 0 : state === "running" ? 8 : 20,
      indexedCount: state === "idle" ? 0 : state === "running" ? 6 : 18,
      failedCount: state === "idle" ? 0 : state === "failed" ? 2 : 0,
      failureCode: state === "failed" ? "rootTraversalFailed" : null,
    };
    emit({ event: "libraryScanStateChanged", payload: scan });
  };

  const api: TNativeAPI = {
    getPlaybackState: async () => {
      if (options.failPlaybackInitialization) throw { code: "noOutputDevice" };
      return playback;
    },
    getPlaybackQueue: async () => wire(queue),
    getPlaybackQueueWindow: async (offset, limit) => ({
      revision: queue.revision,
      offset,
      items: queue.upcoming.slice(offset, offset + Math.min(limit, 200)),
    }),
    pausePlayback: async () =>
      mock.status === "playing" ? commit({ status: "paused" }) : playback,
    resumePlayback: async () =>
      mock.status === "paused" ? commit({ status: "playing" }) : playback,
    previousPlayback: async () => {
      const index = currentSequence.findIndex((track) => track.id === currentTrack?.id);
      const previous = index > 0 ? currentSequence[index - 1] : undefined;
      return previous ? setTrack(previous, currentSequence) : playback;
    },
    nextPlayback: async () => {
      const index = currentSequence.findIndex((track) => track.id === currentTrack?.id);
      const next = index >= 0 ? currentSequence[index + 1] : undefined;
      return next ? setTrack(next, currentSequence) : playback;
    },
    seekPlayback: async (positionMs) =>
      mock.status === "stopped"
        ? playback
        : commit({ positionMs, seekRevision: mock.seekRevision + 1 }),
    setPlaybackVolume: async (volume) => commit({ volume }),
    setPlaybackMuted: async (muted) => commit({ muted }),
    getTrackLyrics: async (trackId) => {
      recordRequest("lyrics");
      const configured = lyricsByTrack.get(trackId);
      if (configured !== undefined && "fail" in configured) throw { code: configured.fail };
      return configured ?? { status: "notFound", trackId };
    },
    getArtworkAccent: async (contentHash) => {
      recordRequest("accent");
      return accentByHash.get(contentHash) ?? null;
    },
    selectLibraryDirectory: async () => "C:/More Music",
    getLibraryStatus: async () =>
      options.libraryUnavailable
        ? { status: "unavailable" as const, reason: "databaseCorrupt" as const }
        : { status: "ready" as const },
    listLibraryRoots: async () => roots,
    registerLibraryRoot: async (path) => {
      const registered: LibraryRoot = {
        id: `root-${roots.length + 1}`,
        path,
        enabled: true,
        scanGeneration: 0,
        lastSuccessfulScanAtMs: null,
      };
      roots = [...roots, registered];
      return registered;
    },
    setLibraryRootEnabled: async (id, enabled) => {
      roots = roots.map((item) => (item.id === id ? { ...item, enabled } : item));
      return roots.find((item) => item.id === id)!;
    },
    removeLibraryRoot: async (id) => {
      roots = roots.filter((item) => item.id !== id);
      return null;
    },
    listAudioOutputDevices: async () => outputDevices,
    setPlaybackRepeatMode: async (mode) => {
      queueRevision += 1;
      queue = { ...queue, revision: queueRevision, repeatMode: mode };
      emit({ event: "playbackQueueStateChanged", payload: wire(queue) });
      return wire(queue);
    },
    setPlaybackShuffle: async (enabled) => {
      queueRevision += 1;
      queue = { ...queue, revision: queueRevision, shuffleEnabled: enabled };
      emit({ event: "playbackQueueStateChanged", payload: wire(queue) });
      return wire(queue);
    },
    removeQueueItem: async (id) => {
      queueRevision += 1;
      queue = {
        ...queue,
        revision: queueRevision,
        upcoming: queue.upcoming.filter((item) => item.id !== id),
      };
      emit({ event: "playbackQueueStateChanged", payload: wire(queue) });
      return wire(queue);
    },
    moveQueueItem: async (id, to) => {
      const index = queue.upcoming.findIndex((item) => item.id === id);
      const target = Math.min(Math.max(to, 0), queue.upcoming.length - 1);
      if (index >= 0 && target !== index) {
        const upcoming = [...queue.upcoming];
        const [item] = upcoming.splice(index, 1);
        upcoming.splice(target, 0, item!);
        queueRevision += 1;
        queue = { ...queue, revision: queueRevision, upcoming };
        emit({ event: "playbackQueueStateChanged", payload: wire(queue) });
      }
      return wire(queue);
    },
    playQueueItem: async (id) => {
      const item = wire(queue)
        .history.concat(queue.upcoming)
        .find((entry) => entry.id === id);
      const track = tracks.find((entry) => entry.id === item?.trackId);
      if (track === undefined) throw { code: "queueItemNotFound" };
      return setTrack(track, currentSequence);
    },
    enqueueTrack: async (trackId, next) => {
      const track = tracks.find((entry) => entry.id === trackId);
      if (track === undefined) throw { code: "invalidTrackId" };
      if (queue.current === null) {
        setTrack(track);
        return wire(queue);
      }
      queueRevision += 1;
      const entry = { ...queueItemFor(track), id: `${track.id}-queued-${queueRevision}` };
      queue = {
        ...queue,
        revision: queueRevision,
        upcoming: next ? [entry, ...queue.upcoming] : [...queue.upcoming, entry],
      };
      emit({ event: "playbackQueueStateChanged", payload: wire(queue) });
      return wire(queue);
    },
    clearQueue: async () => {
      queueRevision += 1;
      queue = { ...queue, revision: queueRevision, upcoming: [] };
      emit({ event: "playbackQueueStateChanged", payload: wire(queue) });
      return wire(queue);
    },
    setAudioOutputSelection: async (selection) => {
      recordRequest("outputSelection");
      outputSelection = selection;
      return commit({});
    },
    getPlaybackWaveform: async (path) => {
      recordRequest("waveform");
      if (!waveformReady || mock.item?.file.path !== path) return null;
      const peaks = Array.from({ length: 400 }, (_, index) =>
        Math.round(40 + 200 * Math.abs(Math.sin(index / 9))),
      );
      return { path, peaks, rms: peaks.map((peak) => Math.round(peak * 0.6)) };
    },
    getLibraryScanState: async () => scan,
    startLibraryScan: async () => {
      setScanState("running");
      return null;
    },
    cancelLibraryScan: async () => {
      setScanState("cancelled");
      return null;
    },
    listLibraryTracks: async (cursor, search) => {
      recordRequest("tracks");
      const query = search?.toLocaleLowerCase() ?? "";
      const filtered = roots.some((item) => item.enabled)
        ? tracks.filter((track) =>
            [track.title, track.artist, track.album, track.albumArtist]
              .filter(Boolean)
              .some((value) => value!.toLocaleLowerCase().includes(query)),
          )
        : [];
      const start = cursor === null ? 0 : Number(cursor);
      const items = filtered.slice(start, start + 40);
      const next = start + items.length;
      return {
        items,
        totalCount: filtered.length,
        nextCursor: next < filtered.length ? String(next) : null,
      };
    },
    listLibraryAlbums: async (_cursor, search) => {
      recordRequest("albums");
      const extra = Array.from({ length: options.extraAlbums ?? 0 }, (_, index) => ({
        key: {
          title: `Extra album ${String(index).padStart(4, "0")}`,
          albumArtist: "Extra artist",
        },
        artwork: null,
        year: 2000 + (index % 20),
      }));
      const all = roots.some((item) => item.enabled)
        ? [albumSummary, secondaryAlbum, ...extra]
        : [];
      const query = search?.toLocaleLowerCase() ?? "";
      const items = all.filter((album) =>
        `${album.key.title} ${album.key.albumArtist}`.toLocaleLowerCase().includes(query),
      );
      return { items, totalCount: items.length, nextCursor: null };
    },
    listLibraryAlbumArtists: async (_cursor, search) => {
      recordRequest("artists");
      const query = search?.toLocaleLowerCase() ?? "";
      const items =
        roots.some((item) => item.enabled) && artist.key.name.toLocaleLowerCase().includes(query)
          ? [artist]
          : [];
      return { items, totalCount: items.length, nextCursor: null };
    },
    getLibraryAlbumArtist: async (_key) => {
      if (options.failArtistDetails) throw { code: "persistenceFailed" };
      return artist;
    },
    listLibraryArtistAlbums: async (key) => {
      recordRequest("artistAlbums");
      if (options.failArtistAlbums) throw { code: "persistenceFailed" };
      const items = key.name === artist.key.name ? [albumSummary, secondaryAlbum] : [];
      return { items, totalCount: items.length, nextCursor: null };
    },
    getLibraryAlbumDetails: async (key) => {
      if (options.failAlbumDetails) throw { code: "persistenceFailed" };
      return key.title === albumSummary.key.title
        ? albumDetails
        : { ...albumDetails, summary: secondaryAlbum };
    },
    listLibraryAlbumTracks: async (_key, _cursor) => {
      if (options.failAlbumTracks) throw { code: "persistenceFailed" };
      return albumTracks;
    },
    getLibraryTrack: async (id) => tracks.find((track) => track.id === id) ?? null,
    getLibraryTrackProperties: async (id) => {
      const track = tracks.find((entry) => entry.id === id);
      if (track === undefined) return null;
      return {
        id,
        path: `C:/Music/${track.title}.flac`,
        fileName: `${track.title}.flac`,
        title: track.title,
        artist: track.artist,
        album: track.album,
        albumArtist: track.albumArtist,
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
    revealLibraryTrack: async (id) => {
      recordRequest(`reveal:${id}`);
      return null;
    },
    startPlayback: async (context, startTrackId) => {
      const sequence =
        context.kind === "album"
          ? albumTracks.items
              .map((item) => tracks.find((track) => track.id === item.id))
              .filter((track): track is LibraryTrackSummary => Boolean(track?.playable))
          : context.kind === "trackIds"
            ? context.trackIds.flatMap((id) => tracks.filter((track) => track.id === id))
            : tracks.filter((track) => track.playable);
      const start =
        startTrackId === null ? sequence[0] : sequence.find((track) => track.id === startTrackId);
      if (start === undefined) throw { code: "trackNotMember" };
      return setTrack(start, sequence);
    },
    getSettings: async () => settings,
    updateSettings: async (patch) => {
      settings = {
        ...settings,
        appearance: {
          ...settings.appearance,
          ...(patch.appearance?.artworkBackdrop == null
            ? {}
            : { artworkBackdrop: patch.appearance.artworkBackdrop }),
          ...(patch.appearance?.calmMotion == null
            ? {}
            : { calmMotion: patch.appearance.calmMotion }),
        },
      };
      emit({ event: "settingsChanged", payload: settings });
      return settings;
    },
    onEvent: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const testState: NativeTestState = {
    getRequestCount: (kind) => requestCounts[kind] ?? 0,
    setLyrics: (trackId, resolution) => void lyricsByTrack.set(trackId, resolution),
    setArtworkAccent: (contentHash, color) => void accentByHash.set(contentHash, color),
    publishWaveform: () => {
      waveformReady = true;
      if (mock.item !== null) {
        emit({ event: "waveformReady", payload: { path: mock.item.file.path } });
      }
    },
    setScanState,
    overrideApi: (overrides) => void Object.assign(api, overrides),
    startPlaybackTicks,
    stopPlaybackTicks,
  };
  Object.defineProperty(window, "__niceAudioPlayerTest", { value: testState });
  Object.defineProperty(window, "__TAURI_TEST_API__", { value: api });
}
