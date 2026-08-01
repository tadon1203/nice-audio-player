import type { AudioOutputDevice, PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";
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
  const outputDevices = fixtureDevices(fixture);
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
            outputDevices={outputDevices}
            isLoadingDevices={false}
            isOutputSelectionPending={false}
            isPlaybackAvailable
            isTransportCommandPending={false}
            pendingTransportCommand={null}
            isScrubbing={false}
            positionDraft={0}
            isSeekPending={fixture === "seek-pending"}
            isAdjustingVolume={false}
            volumeDraft={50}
            isVolumePending={false}
            playbackError={playbackError}
            deviceListError={null}
            onPlay={noop}
            onPause={noop}
            onResume={noop}
            onStop={noop}
            onSeek={noop}
            onSeekCommit={noop}
            onSeekCancel={noop}
            onVolumeChange={noop}
            onVolumePointerDown={noop}
            onVolumeCommit={noop}
            onVolumePointerCancel={noop}
            onMuteToggle={noop}
            onOutputSelectionChange={noop}
            onRefreshDevices={noop}
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
  if (fixture === "playing" || fixture === "seek-pending") {
    return {
      status: "playing",
      revision: 1,
      file: audioFile(layoutStressFixtures.longFilename),
      playbackId: "layout-fixture",
      positionMs: 83_000,
      durationMs: 245_000,
      volume: 0.72,
      muted: false,
      outputSelection: { kind: "systemDefault" },
      outputDevice: { id: "default", name: "System speakers" },
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

function fixtureDevices(fixture: LayoutFixtureName): AudioOutputDevice[] {
  return [
    {
      id: fixture === "long-device" ? "long-device" : "default",
      name: fixture === "long-device" ? layoutStressFixtures.longDeviceName : "System speakers",
      isDefault: true,
    },
  ];
}
