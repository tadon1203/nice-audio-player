import type { PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";
import { AppShell } from "@/components/AppShell";
import { NowPlayingView } from "@/components/NowPlayingView";
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
  const validatedFile = fixtureFile(fixture);
  const playback = fixturePlayback(fixture);
  const playbackError = fixture === "failed" ? layoutStressFixtures.longError : null;

  return (
    <div data-layout-fixture={fixture}>
      <AppShell
        main={
          <NowPlayingView
            validatedFile={validatedFile}
            isValidatingFile={false}
            isFileSelectionDisabled={playback.status === "playing" || playback.status === "paused"}
            validationError={null}
            onSelectFile={noop}
          />
        }
        dock={
          <PlaybackDock
            playback={playback}
            validatedFile={validatedFile}
            isPlaybackAvailable
            isTransportCommandPending={false}
            pendingTransportCommand={null}
            seekPreviewMs={fixture === "seek-pending" ? 700 : null}
            isSeekPending={fixture === "seek-pending"}
            volumeValue={Math.round(playback.volume * 100)}
            isVolumeUpdatePending={false}
            isMutePending={false}
            playbackError={playbackError}
            presentationTitle={
              validatedFile?.fileName.replace(/\.[^.]+$/, "") ?? "No audio selected"
            }
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

function fixtureFile(fixture: LayoutFixtureName): ValidatedAudioFile | null {
  if (fixture === "empty") {
    return null;
  }
  if (fixture === "unbroken-filename") {
    return audioFile(layoutStressFixtures.unbrokenFilename);
  }
  if (fixture === "japanese-filename") {
    return audioFile(layoutStressFixtures.japaneseFilename);
  }
  return audioFile(layoutStressFixtures.longFilename);
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
