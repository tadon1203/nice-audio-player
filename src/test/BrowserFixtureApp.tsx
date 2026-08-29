import type {
  LibraryAlbumDetails,
  LibraryAlbumKey,
  LibraryAlbumSummary,
  LibraryAlbumTrackPage,
  LibraryAlbumTrackSummary,
  LibraryAlbumArtistPage,
  LibraryAlbumArtistSummary,
  LibraryTrackSummary,
  LibraryTrackPage,
  PlaybackQueueItem,
  PlaybackSnapshot,
  ValidatedAudioFile,
} from "@/bindings";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PlaybackDock } from "@/components/PlaybackDock";
import { PlaybackQueueActions, PlaybackQueuePane } from "@/components/PlaybackQueuePane";
import { PlaybackContextPane } from "@/components/PlaybackContextPane";
import { LyricsPane } from "@/components/LyricsPane";
import type { AcceptedPlaybackSeek } from "@/hooks/use-seek-controller";
import { LibraryView } from "@/features/library/LibraryView";
import {
  LibraryWorkspaceProvider,
  useLibraryWorkspace,
  type LibraryBrowseClient,
} from "@/features/library/LibraryWorkspace";

import type { BrowserFixtureName } from "./browser-fixture-state";
import { layoutStressFixtures } from "./layout-stress-fixtures";

interface BrowserFixtureAppProps {
  fixture: BrowserFixtureName;
}

const noop = () => undefined;

const defaultPlayback: PlaybackSnapshot = {
  status: "stopped",
  revision: 0,
  file: null,
  volume: 0.5,
  muted: false,
  outputSelection: { kind: "systemDefault" },
  canGoPrevious: false,
  canGoNext: false,
};

function audioFile(fileName: string): ValidatedAudioFile {
  return {
    path: `C:/Music/${fileName}`,
    fileName,
    extension: "flac",
  };
}

export function BrowserFixtureApp({ fixture }: BrowserFixtureAppProps) {
  const [destination, setDestination] = useState<"library" | "settings">("library");
  const [contextMode, setContextMode] = useState<"queue" | "lyrics" | null>(
    fixture === "queue-open" ? "queue" : null,
  );
  const queueButtonRef = useRef<HTMLButtonElement>(null);
  const lyricsButtonRef = useRef<HTMLButtonElement>(null);
  const restoreContextFocusRef = useRef<"queue" | "lyrics" | null>(null);
  useLayoutEffect(() => {
    if (contextMode !== null || !restoreContextFocusRef.current) return;
    const target =
      restoreContextFocusRef.current === "queue" ? queueButtonRef.current : lyricsButtonRef.current;
    target?.focus({ preventScroll: true });
    restoreContextFocusRef.current = null;
  }, [contextMode]);
  const playback = fixturePlayback(fixture);
  const playbackError = fixture === "failed" ? layoutStressFixtures.longError : null;

  return (
    <div data-layout-fixture={fixture}>
      <LibraryWorkspaceProvider
        client={fixture === "library-empty" ? emptyLibraryClient : fixtureClient}
      >
        <AppShell
          destination={destination}
          onDestinationChange={setDestination}
          contextPane={
            contextMode ? (
              <PlaybackContextPane
                mode={contextMode}
                actions={
                  contextMode === "queue" ? (
                    <PlaybackQueueActions queue={layoutQueueFixture} />
                  ) : undefined
                }
                onClose={() => {
                  restoreContextFocusRef.current = contextMode;
                  setContextMode(null);
                }}
              >
                {contextMode === "queue" ? (
                  <PlaybackQueuePane queue={layoutQueueFixture} playbackStatus="playing" />
                ) : (
                  <LyricsPane
                    trackTitle="Fixture lyric track"
                    trackArtist="Fixture Artist"
                    trackId="fixture-track-1"
                    identityPending={false}
                    playback={fixturePlayingPlayback(
                      "Fixture lyric track.flac",
                      playback.revision,
                      "fixture-lyrics",
                    )}
                    lyrics={fixtureLyricsState}
                    onRetry={noop}
                    canSeek
                    acceptedSeek={null}
                    onRequestSeek={async (positionMs): Promise<AcceptedPlaybackSeek> => ({
                      id: positionMs,
                      playbackId: "fixture-lyrics",
                      acceptedRevision: playback.revision,
                      positionMs,
                    })}
                  />
                )}
              </PlaybackContextPane>
            ) : undefined
          }
          main={
            (fixture === "album-detail-wide" ||
              fixture === "library-browse" ||
              fixture === "library-empty") &&
            destination === "library" ? (
              <LibraryFixtureSurface initialDetail={fixture === "album-detail-wide"} />
            ) : (
              <section
                className={`${destination === "library" ? "library-view" : "settings-view"} page-frame`}
                data-fixture-view={destination}
                aria-label={destination === "library" ? "Library" : "Settings"}
              >
                <div className="content-frame">
                  <h1>{destination === "library" ? "Library" : "Settings"}</h1>
                  <p>Deterministic {destination} fixture content.</p>
                </div>
              </section>
            )
          }
          dock={
            <PlaybackDock
              playback={playback}
              track={{
                title: fixturePresentationTitle(fixture),
                artist: fixture === "playing" ? "Artist" : null,
                artworkUrl: null,
                artworkLoading: false,
              }}
              transport={{
                available: true,
                pending: false,
                pendingCommand: null,
                hasResumablePlayback: playback.status === "paused",
                play: noop,
                pause: noop,
                resume: noop,
                previous: noop,
                next: noop,
              }}
              seek={{
                previewMs: fixture === "seek-pending" ? 700 : null,
                pending: fixture === "seek-pending",
                change: noop,
                commit: noop,
                cancel: noop,
              }}
              volume={{
                value: Math.round(playback.volume * 100),
                updatePending: false,
                mutePending: false,
                change: noop,
                commit: noop,
                cancel: noop,
                toggleMute: noop,
              }}
              context={{
                mode: contextMode,
                toggle: (mode) => setContextMode((current) => (current === mode ? null : mode)),
                queueButtonRef,
                lyricsButtonRef,
              }}
              error={playbackError}
            />
          }
        />
      </LibraryWorkspaceProvider>
    </div>
  );
}

const queueItems: PlaybackQueueItem[] = Array.from({ length: 16 }, (_, index) => ({
  id: `queue-fixture-${index + 1}`,
  title: `Queue fixture track ${index + 1}`,
  artist: "Fixture Artist",
  durationMs: 180_000 + index * 1_000,
}));

const layoutQueueFixture = {
  current: queueItems[0] ?? null,
  upcoming: queueItems.slice(1),
  repeatMode: "off" as const,
  shuffleEnabled: false,
  pending: false,
  error: null,
  refresh: async () => undefined,
  setRepeatMode: noop,
  setShuffle: noop,
  removeItem: noop,
  moveItem: noop,
  clearUpcoming: noop,
};

const fixtureLyricsState: import("@/hooks/use-track-lyrics").TrackLyricsState = {
  kind: "resolved",
  trackId: "fixture-track-1",
  resolution: {
    status: "resolved",
    track_id: "fixture-track-1",
    notice: null,
    document: {
      source: "embedded",
      language: "en",
      content: {
        kind: "timed",
        lines: [
          { startMs: 0, text: "Fixture lyric opening" },
          { startMs: 8_000, text: "Fixture lyric second line" },
          { startMs: 16_000, text: "Fixture lyric third line" },
          { startMs: 24_000, text: "Fixture lyric closing" },
        ],
      },
    },
  },
};

const fixtureArtwork = {
  contentHash: "a".repeat(64),
  mimeType: "jpeg" as const,
  relativePath: `artwork/aa/${"a".repeat(64)}.jpg`,
};

const fixtureAlbum: LibraryAlbumSummary = {
  key: { title: "A Very Long Album Title For Layout Verification", albumArtist: "Fixture Artist" },
  artwork: fixtureArtwork,
};
const fixtureTracks: LibraryAlbumTrackSummary[] = Array.from({ length: 130 }, (_, index) => ({
  id: `fixture-track-${index + 1}`,
  title: `Fixture track ${index + 1}`,
  artist: "Fixture Artist",
  trackNumber: index + 1,
  discNumber: 1,
  durationMs: 272_000,
  availability: "available",
  playable: true,
}));
const fixtureTrackSummaries: LibraryTrackSummary[] = fixtureTracks.map((track) => ({
  ...track,
  album: fixtureAlbum.key.title,
  albumArtist: fixtureAlbum.key.albumArtist,
  artwork: fixtureArtwork,
}));
const fixtureArtist: LibraryAlbumArtistSummary = {
  key: { name: "Fixture Artist" },
  artwork: fixtureArtwork,
  albumCount: 105,
};
const fixtureClient: LibraryBrowseClient = {
  listAlbums: async (cursor: string | null = null, search: string | null = null) =>
    fixturePage(
      fixtureAlbums.filter((album) =>
        search
          ? `${album.key.title} ${album.key.albumArtist}`
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase())
          : true,
      ),
      cursor,
      "albums",
    ),
  listAlbumArtists: async (cursor: string | null = null, search: string | null = null) =>
    fixturePage(
      fixtureArtists.filter((artist) =>
        search ? artist.key.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) : true,
      ),
      cursor,
      "artists",
    ) satisfies LibraryAlbumArtistPage,
  listArtistAlbums: async (key, cursor: string | null = null) =>
    fixturePage(
      fixtureAlbums.filter((album) => album.key.albumArtist === key.name),
      cursor,
      "artist-albums",
    ),
  getArtist: async (key) =>
    structuredClone(fixtureArtists.find((artist) => artist.key.name === key.name) ?? fixtureArtist),
  getAlbumDetails: async (key: LibraryAlbumKey) =>
    structuredClone({
      summary: { artwork: fixtureArtwork, key },
      date: "2000-01-01",
      trackCount: fixtureTracks.length,
      durationMs: fixtureTracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0),
      firstPlayableTrackId: fixtureTracks[0]?.id ?? null,
    }) satisfies LibraryAlbumDetails,
  listAlbumTracks: async (_key, offset = 0) => {
    const items = fixtureTracks.slice(offset, offset + 100);
    return structuredClone({
      items,
      nextOffset: offset + items.length < fixtureTracks.length ? offset + items.length : null,
    } satisfies LibraryAlbumTrackPage);
  },
  listTracks: async (afterId: string | null = null, search: string | null = null) => {
    const filtered = fixtureTrackSummaries.filter((track) =>
      search
        ? `${track.title} ${track.artist ?? ""} ${track.album ?? ""}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase())
        : true,
    );
    const start = afterId
      ? Math.max(0, filtered.findIndex((track) => track.id === afterId) + 1)
      : 0;
    const items = filtered.slice(start, start + 100);
    return structuredClone({
      items,
      nextAfterId:
        start + items.length < filtered.length ? (items[items.length - 1]?.id ?? null) : null,
    } satisfies LibraryTrackPage);
  },
};
const emptyLibraryClient: LibraryBrowseClient = {
  ...fixtureClient,
  listAlbums: async () => ({ items: [], nextCursor: null }),
  listAlbumArtists: async () => ({ items: [], nextCursor: null }),
  listArtistAlbums: async () => ({ items: [], nextCursor: null }),
  getArtist: async () => fixtureArtist,
  getAlbumDetails: async (key) => ({
    summary: { artwork: fixtureArtwork, key },
    date: null,
    trackCount: 0,
    durationMs: null,
    firstPlayableTrackId: null,
  }),
  listAlbumTracks: async () => ({ items: [], nextOffset: null }),
  listTracks: async () => ({ items: [], nextAfterId: null }),
};

const fixtureArtistAlbums: LibraryAlbumSummary[] = [
  fixtureAlbum,
  ...Array.from({ length: 104 }, (_, index) => ({
    key: {
      title:
        index === 0
          ? "日本語アルバム"
          : index === 1
            ? "case album"
            : index === 2
              ? "Case Album"
              : `Fixture Artist Album ${String(index + 4).padStart(3, "0")}`,
      albumArtist: "Fixture Artist",
    },
    artwork: fixtureArtwork,
  })),
];
const fixtureOtherArtists: LibraryAlbumArtistSummary[] = Array.from(
  { length: 104 },
  (_, index) => ({
    key: { name: `Artist ${String(index + 1).padStart(3, "0")}` },
    artwork: fixtureArtwork,
    albumCount: 1,
  }),
);
const fixtureOtherAlbums: LibraryAlbumSummary[] = fixtureOtherArtists.map((artist) => ({
  key: { title: `Album ${artist.key.name}`, albumArtist: artist.key.name },
  artwork: fixtureArtwork,
}));
const fixtureArtists: LibraryAlbumArtistSummary[] = [fixtureArtist, ...fixtureOtherArtists];
const fixtureAlbums: LibraryAlbumSummary[] = [...fixtureArtistAlbums, ...fixtureOtherAlbums];

function fixturePage<T>(items: T[], cursor: string | null, kind: string) {
  const cursorPart = cursor?.split(":").pop();
  const offset = cursorPart ? Number(cursorPart) || 0 : 0;
  const page = items.slice(offset, offset + 100);
  return structuredClone({
    items: page,
    nextCursor: offset + page.length < items.length ? `${kind}:${offset + page.length}` : null,
  });
}

function LibraryFixtureSurface({ initialDetail }: { initialDetail: boolean }) {
  return initialDetail ? <FixtureAlbumDetail /> : <FixtureBrowse />;
}

function FixtureBrowse() {
  return (
    <LibraryView
      onOpenSettings={noop}
      onPlayTrack={noop}
      onPlayAlbum={noop}
      onPlayAlbumTrack={noop}
      activeTrackId={null}
      playbackStatus="stopped"
      playbackAvailable
    />
  );
}

function FixtureAlbumDetail() {
  const { openAlbum } = useLibraryWorkspace();
  useEffect(() => openAlbum(fixtureAlbum), [openAlbum]);
  return (
    <LibraryView
      onOpenSettings={noop}
      onPlayTrack={noop}
      onPlayAlbum={noop}
      onPlayAlbumTrack={noop}
      activeTrackId={null}
      playbackStatus="stopped"
      playbackAvailable
    />
  );
}

function fixturePresentationTitle(fixture: BrowserFixtureName): string {
  if (fixture === "empty") return "No audio selected";
  if (fixture === "unbroken-filename")
    return layoutStressFixtures.unbrokenFilename.replace(/\.[^.]+$/, "");
  if (fixture === "japanese-filename")
    return layoutStressFixtures.japaneseFilename.replace(/\.[^.]+$/, "");
  return layoutStressFixtures.longFilename.replace(/\.[^.]+$/, "");
}

function fixturePlayingPlayback(
  fileName: string,
  revision: number,
  playbackId: string,
  canGoPrevious = false,
  canGoNext = false,
): PlaybackSnapshot {
  return {
    status: "playing",
    revision,
    file: audioFile(fileName),
    playbackId,
    positionMs: 10_000,
    durationMs: 180_000,
    volume: 0.5,
    muted: false,
    outputSelection: { kind: "systemDefault" },
    canGoPrevious,
    canGoNext,
    outputDevice: { id: "default", name: "System speakers" },
    channelConversion: "none",
    sourceSampleRate: 44_100,
    outputSampleRate: 44_100,
    resamplingActive: false,
  };
}

function fixturePlayback(fixture: BrowserFixtureName): PlaybackSnapshot {
  if (
    fixture === "playing" ||
    fixture === "seek-pending" ||
    fixture === "volume-low" ||
    fixture === "volume-zero" ||
    fixture === "volume-muted"
  ) {
    return {
      status: "playing",
      revision: 1,
      file: audioFile(layoutStressFixtures.longFilename),
      playbackId: "layout-fixture",
      positionMs: 83_000,
      durationMs: 245_000,
      volume: fixture === "volume-low" ? 0.2 : fixture === "volume-zero" ? 0 : 0.72,
      muted: fixture === "volume-muted",
      outputSelection: { kind: "systemDefault" },
      canGoPrevious: false,
      canGoNext: false,
      outputDevice: { id: "default", name: "System speakers" },
      channelConversion: "monoToStereo",
      sourceSampleRate: 44_100,
      outputSampleRate: 48_000,
      resamplingActive: true,
    };
  }
  if (fixture === "failed") {
    return {
      status: "failed",
      revision: 1,
      file: audioFile(layoutStressFixtures.longFilename),
      playbackId: null,
      error: "outputDeviceUnavailable",
      volume: 0.5,
      muted: false,
      outputSelection: { kind: "systemDefault" },
      canGoPrevious: false,
      canGoNext: false,
    };
  }
  if (fixture === "long-device") {
    return {
      ...defaultPlayback,
      outputSelection: { kind: "device", deviceId: "long-device" },
    };
  }
  return defaultPlayback;
}
