import type { PlaybackQueueItem, PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PlaybackDock } from "@/components/PlaybackDock";
import { PlaybackQueuePane } from "@/components/PlaybackQueuePane";
import { Button } from "@/components/ui/Button";

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
  const playback = fixturePlayback(fixture);
  const playbackError = fixture === "failed" ? layoutStressFixtures.longError : null;

  return (
    <div data-layout-fixture={fixture}>
      <AppShell
        destination={destination}
        onDestinationChange={setDestination}
        contextPaneState={queueState ?? undefined}
        contextPane={
          queueState ? (
            <PlaybackQueuePane
              queue={layoutQueueFixture}
              onClose={() => setQueueState("closing")}
              playbackStatus="playing"
            />
          ) : undefined
        }
        main={
          fixture === "album-detail-wide" && destination === "library" ? (
            <AlbumDetailLayoutFixture />
          ) : (
            <section
              className={destination === "library" ? "library-view" : "settings-view"}
              data-fixture-view={destination}
              aria-label={destination === "library" ? "Library" : "Settings"}
            >
              <h1>{destination === "library" ? "Library" : "Settings"}</h1>
              <p>Deterministic {destination} fixture content.</p>
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
            isQueueOpen={queueState === "open"}
            onQueueToggle={() => setQueueState((state) => (state === "open" ? "closing" : "open"))}
          />
        }
      />
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

function AlbumDetailLayoutFixture() {
  return (
    <section className="album-detail" data-fixture-view="library" aria-label="Album detail">
      <div className="album-detail__content">
        <button type="button" className="album-detail__back">
          ← Back to albums
        </button>
        <div className="album-detail__hero">
          <div className="album-detail__artwork-wrap">
            <img
              className="album-detail__artwork library-view__artwork"
              src="data:image/gif;base64,R0lGODlhAQABAAD/ACw="
              alt=""
            />
          </div>
          <div className="album-detail__identity">
            <h1>A Very Long Album Title For Layout Verification</h1>
            <p className="album-detail__artist">Fixture Artist</p>
            <p className="album-detail__meta">2000 · 13 tracks · 42:00</p>
            <Button type="button" variant="filled" className="album-detail__play">
              Play album
            </Button>
          </div>
        </div>
        <div className="album-detail__tracks">
          <section className="album-detail__group">
            <h2>Disc 1</h2>
            <ul className="album-detail__table">
              {Array.from({ length: 13 }, (_, index) => (
                <li key={index}>
                  <button type="button" className="album-detail__row">
                    <span className="type-numeric">{index + 1}</span>
                    <span className="album-detail__track-title">Fixture track {index + 1}</span>
                    <span className="type-numeric">4:32</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </section>
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
