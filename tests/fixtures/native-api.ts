import type { Page } from "@playwright/test";
import type {
  AppEvent,
  LibraryAlbumArtistSummary,
  LibraryAlbumDetails,
  LibraryAlbumTrackPage,
  LibraryRoot,
  LibraryScanSnapshot,
  LibraryScanState,
  LibraryTrackSummary,
  PlaybackQueueSnapshot,
  PlaybackSnapshot,
  TNativeAPI,
} from "@/shared/ipc";

type NativeTestState = {
  getRequestCount: (kind: string) => number;
  setScanState: (state: LibraryScanState) => void;
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
};

declare global {
  interface Window {
    __niceAudioPlayerTest?: NativeTestState;
  }
}

export async function installNativeApi(page: Page, options: InstallNativeApiOptions = {}) {
  await page.addInitScript((options) => {
    const root: LibraryRoot = {
      id: "root-1",
      path: "C:/Music",
      enabled: true,
      scanGeneration: 0,
      lastSuccessfulScanAtMs: null,
    };
    let roots = [root];
    const listeners = new Set<(event: AppEvent) => void>();
    const requestCounts: Record<string, number> = {};
    const recordRequest = (kind: string) => {
      requestCounts[kind] = (requestCounts[kind] ?? 0) + 1;
    };

    const tracks: LibraryTrackSummary[] = Array.from({ length: 140 }, (_, index) => {
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
        artwork: null,
        durationMs: 120_000 + index * 1_000,
        availability: missing ? "missing" : "available",
        playable: !missing,
      };
    });
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
    let playbackRevision = 50;
    let queueRevision = 1;
    let currentTrack: LibraryTrackSummary | null = null;
    let currentSequence: LibraryTrackSummary[] = [];
    let playback: PlaybackSnapshot = {
      status: "stopped",
      revision: playbackRevision,
      file: null,
      volume: 0.72,
      muted: false,
      outputSelection: { kind: "systemDefault" },
      canGoPrevious: false,
      canGoNext: false,
    };
    let queue: PlaybackQueueSnapshot = {
      revision: queueRevision,
      current: null,
      upcoming: [],
      repeatMode: "off",
      shuffleEnabled: false,
    };
    const emit = (event: AppEvent) => listeners.forEach((listener) => listener(event));
    const publishPlayback = () => emit({ event: "playbackStateChanged", payload: playback });
    let playbackTicker: ReturnType<typeof setInterval> | null = null;
    const startPlaybackTicks = () => {
      if (playbackTicker !== null) return;
      playbackTicker = setInterval(() => {
        if (playback.status !== "playing") return;
        playbackRevision += 1;
        playback = {
          ...playback,
          revision: playbackRevision,
          positionMs: Math.min(
            playback.positionMs + 250,
            playback.durationMs ?? playback.positionMs + 250,
          ),
        };
        publishPlayback();
      }, 10);
    };
    const stopPlaybackTicks = () => {
      if (playbackTicker === null) return;
      clearInterval(playbackTicker);
      playbackTicker = null;
    };
    const setTrack = (track: LibraryTrackSummary, sequence: LibraryTrackSummary[] = [track]) => {
      currentTrack = track;
      currentSequence = sequence.filter(
        (item) => item.playable && item.availability === "available",
      );
      const index = Math.max(
        0,
        currentSequence.findIndex((item) => item.id === track.id),
      );
      const upcoming = currentSequence.slice(index + 1);
      playbackRevision += 1;
      playback = {
        status: "playing",
        revision: playbackRevision,
        file: fileFor(track),
        playbackId: `playback-${track.id}`,
        positionMs: 12_000,
        durationMs: track.durationMs,
        volume: playback.volume,
        muted: playback.muted,
        outputSelection: { kind: "systemDefault" },
        outputDevice: { id: "default", name: "System default" },
        channelConversion: "none",
        sourceSampleRate: 44_100,
        outputSampleRate: 48_000,
        resamplingActive: true,
        canGoPrevious: index > 0,
        canGoNext: index < currentSequence.length - 1,
      };
      queueRevision += 1;
      queue = {
        revision: queueRevision,
        current: {
          id: track.id,
          title: track.title,
          artist: track.artist,
          durationMs: track.durationMs,
        },
        upcoming: upcoming.map((item) => ({
          id: item.id,
          title: item.title,
          artist: item.artist,
          durationMs: item.durationMs,
        })),
        repeatMode: "off",
        shuffleEnabled: false,
      };
      emit({ event: "playbackQueueStateChanged", payload: queue });
      publishPlayback();
      return playback;
    };
    const scanRoot = (): LibraryRoot | null => roots.find((item) => item.enabled) ?? null;
    let scan: LibraryScanSnapshot = {
      state: "idle",
      currentRoot: null,
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
        discoveredCount: state === "idle" ? 0 : 20,
        inspectedCount: state === "idle" ? 0 : state === "running" ? 8 : 20,
        indexedCount: state === "idle" ? 0 : state === "running" ? 6 : 18,
        failedCount: state === "idle" ? 0 : state === "failed" ? 2 : 0,
        failureCode: state === "failed" ? "scanFailed" : null,
      };
      emit({ event: "libraryScanStateChanged", payload: scan });
    };

    const api: TNativeAPI = {
      getPlaybackState: async () => {
        if (options.failPlaybackInitialization) throw { code: "noOutputDevice" };
        return playback;
      },
      getPlaybackQueue: async () => queue,
      pausePlayback: async () => {
        if (playback.status === "playing") {
          playbackRevision += 1;
          playback = { ...playback, status: "paused", revision: playbackRevision };
          publishPlayback();
        }
        return playback;
      },
      resumePlayback: async () => {
        if (playback.status === "paused") {
          playbackRevision += 1;
          playback = { ...playback, status: "playing", revision: playbackRevision };
          publishPlayback();
        }
        return playback;
      },
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
      seekPlayback: async (positionMs) => {
        if (playback.status === "playing" || playback.status === "paused") {
          playbackRevision += 1;
          playback = { ...playback, positionMs, revision: playbackRevision };
          publishPlayback();
        }
        return playback;
      },
      setPlaybackVolume: async (volume) => {
        playbackRevision += 1;
        playback = { ...playback, volume, revision: playbackRevision };
        publishPlayback();
        return playback;
      },
      setPlaybackMuted: async (muted) => {
        playbackRevision += 1;
        playback = { ...playback, muted, revision: playbackRevision };
        publishPlayback();
        return playback;
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
      listAudioOutputDevices: async () => [],
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
        const all = roots.some((item) => item.enabled) ? [albumSummary, secondaryAlbum] : [];
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
      getLibraryTrackForPath: async (path) =>
        tracks.find((track) => fileFor(track).path === path) ?? null,
      startLibraryTrack: async (id) =>
        setTrack(tracks.find((track) => track.id === id && track.playable)!),
      startLibraryAlbum: async () => {
        const sequence = albumTracks.items
          .map((item) => tracks.find((track) => track.id === item.id))
          .filter((track): track is LibraryTrackSummary => Boolean(track?.playable));
        return setTrack(sequence[0]!, sequence);
      },
      onEvent: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    const testState: NativeTestState = {
      getRequestCount: (kind) => requestCounts[kind] ?? 0,
      setScanState,
      startPlaybackTicks,
      stopPlaybackTicks,
    };
    Object.defineProperty(window, "__niceAudioPlayerTest", { value: testState });
    Object.defineProperty(window, "__TAURI_TEST_API__", { value: api });
  }, options);
}
