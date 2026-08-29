import { useState } from "react";
import type { PlaybackFailureCode } from "@/bindings";
import { AppShell } from "./components/AppShell";
import { ApplicationActivityIndicator } from "./components/ApplicationActivityIndicator";
import { PlaybackDock } from "./components/PlaybackDock";
import { LibraryView } from "./features/library";
import { LibraryWorkspaceProvider } from "./features/library/LibraryWorkspace";
import { SettingsView } from "./features/settings";
import { useActiveTrackIdentity } from "./hooks/use-active-track-identity";
import { useSeekController } from "./hooks/use-seek-controller";
import { useVolumeController } from "./hooks/use-volume-controller";
import { useLibraryScan } from "./features/library/use-library-scan";
import { useApplicationActivities } from "./hooks/use-application-activities";
import { usePlaybackQueue } from "./hooks/use-playback-queue";
import { PlaybackQueueActions, PlaybackQueuePane } from "./components/PlaybackQueuePane";
import { PlaybackContextPane } from "./components/PlaybackContextPane";
import { LyricsPane } from "./components/LyricsPane";
import { useTrackLyrics } from "./hooks/use-track-lyrics";
import { usePlaybackSession } from "./hooks/use-playback-session";
import { useTransportController } from "./hooks/use-transport-controller";
import { useAudioOutputController } from "./hooks/use-audio-output-controller";
import { usePlaybackContextController } from "./hooks/use-playback-context-controller";
import { useAppShortcuts } from "./hooks/use-app-shortcuts";

type PlaybackContextCloseReason = "closeButton" | "escape" | "trigger" | "navigation";
function formatPlaybackFailure(code: PlaybackFailureCode): string {
  const messages: Record<PlaybackFailureCode, string> = {
    noOutputDevice: "No audio output device is available.",
    outputDeviceUnavailable: "The selected output device is unavailable.",
    unsupportedOutputConfiguration: "The output device configuration is unsupported.",
    outputStreamBuildFailed: "The audio output could not be prepared.",
    outputStreamStartFailed: "The audio output could not be started.",
    outputStreamPauseFailed: "The audio output could not be paused.",
    outputStreamResumeFailed: "The audio output could not be resumed.",
    outputStreamRuntimeFailed: "The audio output stopped unexpectedly.",
    completionTimingFailed: "Playback completion could not be determined.",
    decodeFailed: "The audio file could not be decoded.",
    sampleRateConversionFailed: "The audio could not be converted.",
  };
  return messages[code];
}

function App() {
  const [destination, setDestination] = useState<"library" | "settings">("library");
  const { snapshot: scan, error: scanError, libraryRefreshKey } = useLibraryScan();
  const { selected: applicationActivity } = useApplicationActivities();
  const {
    playbackUi,
    playback,
    dispatchPlaybackUi,
    applySnapshot,
    refreshAuthoritativeSnapshot: refresh,
  } = usePlaybackSession();
  const isPlaybackAvailable = playbackUi.connection === "ready";
  const contextController = usePlaybackContextController();
  const {
    mode: contextMode,
    isOpen: isContextOpen,
    open: openContext,
    queueTriggerRef: queueButtonRef,
    lyricsTriggerRef: lyricsButtonRef,
  } = contextController;
  const closeContext = (reason: PlaybackContextCloseReason = "closeButton") => {
    contextController.close(reason !== "navigation" && reason !== "trigger");
  };
  const transportController = useTransportController({
    playback,
    connection: playbackUi.connection,
    applySnapshot,
    refreshAuthoritativeSnapshot: refresh,
    dispatchPlaybackUi,
  });
  const { requestTransport, pendingTransportCommand, isTransportCommandPending } =
    transportController;
  useAppShortcuts({
    contextMode,
    onCloseContext: () => closeContext("escape"),
    onToggleContext: (mode) => {
      if (contextMode === mode) closeContext("trigger");
      else {
        if (contextMode) {
          const trigger = mode === "queue" ? queueButtonRef : lyricsButtonRef;
          trigger.current?.focus({ preventScroll: true });
        }
        openContext(mode);
      }
    },
    onTogglePlayback: () => {
      if (playback.status === "playing" || playback.status === "paused")
        void requestTransport({ type: playback.status === "playing" ? "pause" : "resume" });
    },
  });
  const outputController = useAudioOutputController({
    playback,
    isTransportPending: isTransportCommandPending,
    isPlaybackAvailable,
    applySnapshot,
    dispatchPlaybackUi,
    refreshAuthoritativeSnapshot: refresh,
  });
  const {
    devices: outputDevices,
    loading: isLoadingDevices,
    pending: isOutputSelectionPending,
    loadDevices: loadOutputDevices,
    selectDevice: changeOutputSelection,
  } = outputController;
  const activeTrack = useActiveTrackIdentity(playback.file);
  const trackLyrics = useTrackLyrics(activeTrack.id, isContextOpen && contextMode === "lyrics");
  const queue = usePlaybackQueue();
  const seekController = useSeekController({
    playback,
    connection: playbackUi.connection,
    isTransportCommandPending,
    isOutputSelectionPending,
    applySnapshot,
    refreshAuthoritativeSnapshot: refresh,
    dispatchPlaybackUi,
  });
  const volumeController = useVolumeController({
    playback,
    connection: playbackUi.connection,
    applySnapshot,
    refreshAuthoritativeSnapshot: refresh,
    dispatchPlaybackUi,
  });
  const main =
    destination === "library" ? (
      <LibraryView
        playbackAvailable={isPlaybackAvailable}
        onOpenSettings={() => setDestination("settings")}
        onPlayTrack={(id) => void requestTransport({ type: "startTrack", trackId: id })}
        onPlayAlbum={(albumKey) => void requestTransport({ type: "startAlbum", albumKey })}
        onPlayAlbumTrack={(albumKey, trackId) =>
          void requestTransport({ type: "startAlbumTrack", albumKey, trackId })
        }
        activeTrackId={activeTrack.id}
        playbackStatus={playback.status}
        libraryRefreshKey={libraryRefreshKey}
        scanError={scanError}
      />
    ) : (
      <SettingsView
        outputDevices={outputDevices}
        selectedOutput={playback.outputSelection}
        onOutputSelectionChange={(value) => void changeOutputSelection(value)}
        onRefreshDevices={() => void loadOutputDevices()}
        outputDisabled={
          isOutputSelectionPending ||
          isTransportCommandPending ||
          isLoadingDevices ||
          !isPlaybackAvailable ||
          playback.status === "playing" ||
          playback.status === "paused"
        }
        scan={scan}
        scanError={scanError}
      />
    );
  return (
    <LibraryWorkspaceProvider>
      <AppShell
        destination={destination}
        onDestinationChange={(next) => {
          closeContext("navigation");
          setDestination(next);
        }}
        main={main}
        contextPane={
          contextMode ? (
            <PlaybackContextPane
              mode={contextMode}
              onClose={closeContext}
              actions={contextMode === "queue" ? <PlaybackQueueActions queue={queue} /> : undefined}
            >
              {contextMode === "queue" ? (
                <PlaybackQueuePane queue={queue} playbackStatus={playback.status} />
              ) : (
                <LyricsPane
                  trackTitle={activeTrack.title}
                  trackArtist={activeTrack.artist}
                  trackId={activeTrack.id}
                  identityPending={activeTrack.lookupPending}
                  playback={playback}
                  lyrics={trackLyrics.state}
                  onRetry={trackLyrics.retry}
                  canSeek={seekController.canSeek}
                  acceptedSeek={seekController.acceptedSeek}
                  onRequestSeek={seekController.requestSeek}
                />
              )}
            </PlaybackContextPane>
          ) : undefined
        }
        activity={
          <ApplicationActivityIndicator
            activity={applicationActivity}
            onOpenSettings={() => {
              closeContext("navigation");
              setDestination("settings");
            }}
          />
        }
        dock={
          <PlaybackDock
            playback={playback}
            track={{
              title: activeTrack.title,
              artist: activeTrack.artist,
              artworkUrl: activeTrack.artworkUrl,
              artworkLoading: activeTrack.artworkLoading,
            }}
            transport={{
              available: isPlaybackAvailable,
              pending: isTransportCommandPending,
              pendingCommand: pendingTransportCommand,
              hasResumablePlayback: playback.status === "paused",
              play: () => void requestTransport({ type: "resume" }),
              pause: () => void requestTransport({ type: "pause" }),
              resume: () => void requestTransport({ type: "resume" }),
              previous: () => void requestTransport({ type: "previous" }),
              next: () => void requestTransport({ type: "next" }),
            }}
            seek={{
              previewMs: seekController.seekPreviewMs,
              pending: seekController.isSeekPending,
              change: seekController.onSeek,
              commit: (value) => void seekController.requestSeek(value),
              cancel: seekController.onSeekCancel,
            }}
            volume={{
              value: volumeController.volumeValue,
              updatePending: volumeController.isVolumeUpdatePending,
              mutePending: volumeController.isMutePending,
              change: volumeController.onVolumeChange,
              commit: volumeController.onVolumeCommit,
              cancel: volumeController.onVolumePointerCancel,
              toggleMute: volumeController.onVolumeButtonPress,
            }}
            context={{
              mode: isContextOpen ? contextMode : null,
              toggle: (mode) => {
                if (isContextOpen && contextMode === mode) closeContext("trigger");
                else openContext(mode);
              },
              queueButtonRef,
              lyricsButtonRef,
            }}
            error={
              playbackUi.commandError?.message ??
              playbackUi.connectionError ??
              (playback.status === "failed" ? formatPlaybackFailure(playback.error) : null)
            }
          />
        }
      />
    </LibraryWorkspaceProvider>
  );
}
export default App;
