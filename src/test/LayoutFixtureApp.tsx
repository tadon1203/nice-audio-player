import type { PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PlaybackDock } from "@/components/PlaybackDock";

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
  const playback = fixturePlayback(fixture);
  const playbackError = fixture === "failed" ? layoutStressFixtures.longError : null;

  return (
    <div data-layout-fixture={fixture}>
      <AppShell
        destination={destination}
        onDestinationChange={setDestination}
        main={
          <section
            className={destination === "library" ? "library-view" : "settings-view"}
            data-fixture-view={destination}
            aria-label={destination === "library" ? "Library" : "Settings"}
          >
            <h1>{destination === "library" ? "Library" : "Settings"}</h1>
            <p>Deterministic {destination} fixture content.</p>
          </section>
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
          />
        }
      />
    </div>
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
