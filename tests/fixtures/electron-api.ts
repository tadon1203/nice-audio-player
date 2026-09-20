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
  PlaybackQueue,
  PlaybackState,
  TElectronAPI,
} from "@/shared/ipc";

type ElectronTestState = {
  getRequestCount: (kind: string) => number;
  setScanState: (state: LibraryScanState) => void;
  startPlaybackTicks: () => void;
  stopPlaybackTicks: () => void;
};

type InstallElectronApiOptions = {
  failPlaybackInitialization?: boolean;
  failAlbumDetails?: boolean;
  failAlbumTracks?: boolean;
  failArtistDetails?: boolean;
  failArtistAlbums?: boolean;
  libraryUnavailable?: boolean;
};

declare global {
  interface Window {
    __niceAudioPlayerTest?: ElectronTestState;
  }
}

export async function installElectronApi(page: Page, options: InstallElectronApiOptions = {}) {
  await page.addInitScript((options) => {
    const root: LibraryRoot = {
      id: "root-1",
      path: "C:/Music",
      enabled: true,
      scanGeneration: null,
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
      trackCount: 2,
      durationMs: 300_000,
      firstPlayableTrackId: tracks[0]?.id ?? null,
    };
    const albumTracks: LibraryAlbumTrackPage = {
      items: [tracks[0]!, tracks[4]!].map((track, index) => ({
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
      totalCount: 2,
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
    let playback: PlaybackState = {
      status: "stopped",
      revision: playbackRevision,
      file: null,
      volume: 0.72,
      muted: false,
      outputSelection: { kind: "systemDefault" },
      canGoPrevious: false,
      canGoNext: false,
    };
    let queue: PlaybackQueue = {
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
          positionMs: Math.min(playback.positionMs + 250, playback.durationMs ?? playback.positionMs + 250),
        };
        publishPlayback();
      }, 10);
    };
    const stopPlaybackTicks = () => {
      if (playbackTicker === null) return;
      clearInterval(playbackTicker);
      playbackTicker = null;
    };
    const setTrack = (track: LibraryTrackSummary) => {
      currentTrack = track;
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
        canGoPrevious: track.id !== tracks[0]?.id,
        canGoNext: track.id !== tracks[1]?.id,
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
        upcoming: [],
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
      discoveredCount: null,
      inspectedCount: null,
      indexedCount: null,
      failedCount: null,
      failureCode: null,
    };
    const setScanState = (state: LibraryScanState) => {
      scan = {
        state,
        currentRoot: state === "running" ? scanRoot() : null,
        discoveredCount: state === "idle" ? null : 20,
        inspectedCount: state === "idle" ? null : state === "running" ? 8 : 20,
        indexedCount: state === "idle" ? null : state === "running" ? 6 : 18,
        failedCount: state === "idle" ? null : state === "failed" ? 2 : 0,
        failureCode: state === "failed" ? "scanFailed" : null,
      };
      emit({ event: "libraryScanStateChanged", payload: scan });
    };

    const api: TElectronAPI = {
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
        const index = tracks.findIndex((track) => track.id === currentTrack?.id);
        const previous = tracks
          .slice(0, Math.max(0, index))
          .reverse()
          .find((track) => track.playable);
        return previous ? setTrack(previous) : playback;
      },
      nextPlayback: async () => {
        const index = tracks.findIndex((track) => track.id === currentTrack?.id);
        const next = tracks.slice(index + 1).find((track) => track.playable);
        return next ? setTrack(next) : playback;
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
      },
      getLibraryScanState: async () => scan,
      startLibraryScan: async () => setScanState("running"),
      cancelLibraryScan: async () => setScanState("cancelled"),
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
      startLibraryAlbum: async () => setTrack(tracks[0]!),
      onEvent: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    const testState: ElectronTestState = {
      getRequestCount: (kind) => requestCounts[kind] ?? 0,
      setScanState,
      startPlaybackTicks,
      stopPlaybackTicks,
    };
    Object.defineProperty(window, "__niceAudioPlayerTest", { value: testState });
    Object.defineProperty(window, "electron", { value: api });
  }, options);
}
