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
import { PlaybackQueuePane } from "@/components/PlaybackQueuePane";
import { PlaybackContextPane } from "@/components/PlaybackContextPane";
import { LibraryView } from "@/features/library/LibraryView";
import {
  LibraryWorkspaceProvider,
  useLibraryWorkspace,
  type LibraryBrowseClient,
} from "@/features/library/LibraryWorkspace";

import type { LayoutFixtureName } from "./layout-fixture-state";
import { layoutStressFixtures } from "./layout-stress-fixtures";

interface LayoutFixtureAppProps {
  fixture: LayoutFixtureName;
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

export function LayoutFixtureApp({ fixture }: LayoutFixtureAppProps) {
  const [destination, setDestination] = useState<"library" | "settings">("library");
  const [queueState, setQueueState] = useState<"open" | "closing" | null>(
    fixture === "queue-open" ? "open" : null,
  );
  const queueButtonRef = useRef<HTMLButtonElement>(null);
  const restoreQueueFocusRef = useRef(false);
  useLayoutEffect(() => {
    if (queueState !== null || !restoreQueueFocusRef.current) return;
    queueButtonRef.current?.focus({ preventScroll: true });
    restoreQueueFocusRef.current = false;
  }, [queueState]);
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
            queueState ? (
              <PlaybackContextPane
                mode="queue"
                onClose={() => {
                  restoreQueueFocusRef.current = true;
                  setQueueState(null);
                }}
              >
                <PlaybackQueuePane queue={layoutQueueFixture} playbackStatus="playing" />
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
              hasResumablePlayback={playback.status === "paused"}
              isPlaybackAvailable
              isTransportCommandPending={false}
              pendingTransportCommand={null}
              seekPreviewMs={fixture === "seek-pending" ? 700 : null}
              isSeekPending={fixture === "seek-pending"}
              volumeValue={Math.round(playback.volume * 100)}
              isVolumeUpdatePending={false}
              isMutePending={false}
              playbackError={playbackError}
              presentationTitle={fixturePresentationTitle(fixture)}
              presentationArtist={fixture === "playing" ? "Artist" : null}
              artworkUrl={null}
              artworkLoading={false}
              onPlay={noop}
              onPause={noop}
              onResume={noop}
              onSeek={noop}
              onSeekCommit={noop}
              onSeekCancel={noop}
              onVolumeChange={noop}
              onVolumeInteractionStart={noop}
              onVolumeCommit={noop}
              onVolumePointerCancel={noop}
              onVolumeButtonPress={noop}
              activeContextMode={queueState === "open" ? "queue" : null}
              queueButtonRef={queueButtonRef}
              onContextModeToggle={() =>
                setQueueState((state) => (state === "open" ? "closing" : "open"))
              }
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

const fixtureAlbum: LibraryAlbumSummary = {
  key: { title: "A Very Long Album Title For Layout Verification", albumArtist: "Fixture Artist" },
  artwork: null,
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
  artwork: null,
}));
const fixtureArtist: LibraryAlbumArtistSummary = {
  key: { name: "Fixture Artist" },
  artwork: null,
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
    fixtureArtists.find((artist) => artist.key.name === key.name) ?? fixtureArtist,
  getAlbumDetails: async (key: LibraryAlbumKey) =>
    ({
      summary: { artwork: null, key },
      date: "2000-01-01",
      trackCount: fixtureTracks.length,
      durationMs: fixtureTracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0),
      firstPlayableTrackId: fixtureTracks[0]?.id ?? null,
    }) satisfies LibraryAlbumDetails,
  listAlbumTracks: async (_key, offset = 0) => {
    const items = fixtureTracks.slice(offset, offset + 100);
    return {
      items,
      nextOffset: offset + items.length < fixtureTracks.length ? offset + items.length : null,
    } satisfies LibraryAlbumTrackPage;
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
    return {
      items,
      nextAfterId:
        start + items.length < filtered.length ? (items[items.length - 1]?.id ?? null) : null,
    } satisfies LibraryTrackPage;
  },
};
const emptyLibraryClient: LibraryBrowseClient = {
  ...fixtureClient,
  listAlbums: async () => ({ items: [], nextCursor: null }),
  listAlbumArtists: async () => ({ items: [], nextCursor: null }),
  listArtistAlbums: async () => ({ items: [], nextCursor: null }),
  getArtist: async () => fixtureArtist,
  getAlbumDetails: async (key) => ({
    summary: { artwork: null, key },
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
    artwork: null,
  })),
];
const fixtureOtherArtists: LibraryAlbumArtistSummary[] = Array.from(
  { length: 104 },
  (_, index) => ({
    key: { name: `Artist ${String(index + 1).padStart(3, "0")}` },
    artwork: null,
    albumCount: 1,
  }),
);
const fixtureOtherAlbums: LibraryAlbumSummary[] = fixtureOtherArtists.map((artist) => ({
  key: { title: `Album ${artist.key.name}`, albumArtist: artist.key.name },
  artwork: null,
}));
const fixtureArtists: LibraryAlbumArtistSummary[] = [fixtureArtist, ...fixtureOtherArtists];
const fixtureAlbums: LibraryAlbumSummary[] = [...fixtureArtistAlbums, ...fixtureOtherAlbums];

function fixturePage<T>(items: T[], cursor: string | null, kind: string) {
  const cursorPart = cursor?.split(":").pop();
  const offset = cursorPart ? Number(cursorPart) || 0 : 0;
  const page = items.slice(offset, offset + 100);
  return {
    items: page,
    nextCursor: offset + page.length < items.length ? `${kind}:${offset + page.length}` : null,
  };
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

function fixturePresentationTitle(fixture: LayoutFixtureName): string {
  if (fixture === "empty") return "No audio selected";
  if (fixture === "unbroken-filename")
    return layoutStressFixtures.unbrokenFilename.replace(/\.[^.]+$/, "");
  if (fixture === "japanese-filename")
    return layoutStressFixtures.japaneseFilename.replace(/\.[^.]+$/, "");
  return layoutStressFixtures.longFilename.replace(/\.[^.]+$/, "");
}

function fixturePlayback(fixture: LayoutFixtureName): PlaybackSnapshot {
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
