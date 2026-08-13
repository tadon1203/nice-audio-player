import type { ValidatedAudioFile } from "@/bindings";
import type { AudioOutputDevice, AudioOutputSelection } from "@/bindings";
import { OutputDeviceIcon, RefreshIcon, StopIcon } from "./icons";

interface NowPlayingViewProps {
  validatedFile: ValidatedAudioFile | null;
  isValidatingFile: boolean;
  isFileSelectionDisabled: boolean;
  validationError: string | null;
  onSelectFile: () => void;
  outputDevices?: AudioOutputDevice[] | null;
  isLoadingDevices?: boolean;
  isOutputSelectionPending?: boolean;
  isPlaybackAvailable?: boolean;
  isTransportCommandPending?: boolean;
  isTimedPlayback?: boolean;
  selectedOutput?: AudioOutputSelection;
  deviceListError?: string | null;
  onStop?: () => void;
  onOutputSelectionChange?: (selection: AudioOutputSelection) => void;
  onRefreshDevices?: () => void;
}

export function NowPlayingView({
  validatedFile,
  isValidatingFile,
  isFileSelectionDisabled,
  validationError,
  onSelectFile,
  outputDevices = null,
  isLoadingDevices = false,
  isOutputSelectionPending = false,
  isPlaybackAvailable = true,
  isTransportCommandPending = false,
  isTimedPlayback = false,
  selectedOutput = { kind: "systemDefault" },
  deviceListError = null,
  onStop,
  onOutputSelectionChange,
  onRefreshDevices,
}: NowPlayingViewProps) {
  const hasFile = validatedFile !== null;
  const heading = hasFile ? validatedFile.fileName : "No audio selected";
  const selectedOutputDeviceId = selectedOutput.kind === "device" ? selectedOutput.deviceId : null;
  const hasSelectedOutputDevice =
    selectedOutputDeviceId !== null &&
    outputDevices?.some((device) => device.id === selectedOutputDeviceId);

  return (
    <section className="now-playing-view mx-auto grid min-h-full w-full max-w-[1360px] content-center px-6 py-12 sm:px-10 lg:px-20">
      <div className="now-playing-view__content mx-auto">
        <p className="now-playing-view__editorial font-character text-text-primary">
          Listening room
        </p>
        {hasFile ? (
          <div className="mt-8 min-h-[88px] space-y-2">
            <h1
              className="now-playing-view__filename font-interface text-display-md text-text-primary"
              title={validatedFile.fileName}
            >
              {heading}
            </h1>
            <p className="text-body-sm text-text-secondary">.{validatedFile.extension}</p>
          </div>
        ) : (
          <div className="mt-8 min-h-[88px] space-y-3">
            <h1 className="font-interface text-display-md text-text-primary">{heading}</h1>
            <p className="text-body-md text-text-secondary">Choose an audio file to begin.</p>
          </div>
        )}

        <div className="mt-8 min-h-6" aria-live="polite">
          {isValidatingFile ? (
            <p className="text-body-sm text-text-secondary">Validating audio file…</p>
          ) : validationError ? (
            <p className="text-body-sm text-error" role="alert">
              {validationError}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onSelectFile}
          disabled={isFileSelectionDisabled}
          aria-busy={isValidatingFile}
          className={`now-playing-view__action mt-4 min-h-12 rounded-control px-5 py-3 font-interface text-body-md font-medium transition-opacity duration-150 ease-interface focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${hasFile ? "border border-border-control text-text-primary disabled:border-border-subtle disabled:bg-transparent disabled:text-text-disabled" : "bg-text-primary text-canvas disabled:bg-surface-pressed disabled:text-text-disabled"}`}
        >
          {isValidatingFile ? "Validating…" : hasFile ? "Choose another file" : "Choose audio file"}
        </button>
        {onStop && onOutputSelectionChange && onRefreshDevices ? (
          <details className="now-playing-view__options mt-4">
            <summary className="min-h-10 cursor-pointer rounded-control border border-border-control px-4 py-2 text-body-md text-text-primary">
              Playback options
            </summary>
            <div className="mt-3 grid gap-3 border-surface-raised py-3">
              <button
                type="button"
                aria-label="Stop"
                aria-busy={isTransportCommandPending}
                disabled={!isTimedPlayback || !isPlaybackAvailable}
                onClick={onStop}
                className="min-h-10 justify-self-start rounded-control border border-border-control px-4 text-body-md text-text-primary disabled:text-text-disabled"
              >
                <StopIcon /> Stop playback
              </button>
              <div className="grid gap-2">
                <label className="text-body-sm text-text-secondary" htmlFor="now-playing-output">
                  Audio output device
                </label>
                <div className="flex min-w-0 gap-2">
                  <OutputDeviceIcon />
                  <select
                    id="now-playing-output"
                    aria-label="Audio output device"
                    value={
                      selectedOutput.kind === "systemDefault"
                        ? "systemDefault"
                        : selectedOutput.deviceId
                    }
                    disabled={
                      !isPlaybackAvailable ||
                      isLoadingDevices ||
                      isOutputSelectionPending ||
                      isTransportCommandPending ||
                      isTimedPlayback
                    }
                    onChange={(event) =>
                      onOutputSelectionChange(
                        event.currentTarget.value === "systemDefault"
                          ? { kind: "systemDefault" }
                          : { kind: "device", deviceId: event.currentTarget.value },
                      )
                    }
                    className="min-h-10 min-w-0 flex-1 rounded-control border border-border-control bg-canvas px-2 text-body-sm text-text-primary"
                  >
                    <option value="systemDefault">System default</option>
                    {selectedOutputDeviceId && !hasSelectedOutputDevice ? (
                      <option value={selectedOutputDeviceId} disabled>
                        Unavailable selected device
                      </option>
                    ) : null}
                    {outputDevices?.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.name}
                        {device.isDefault ? " — Current default" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Refresh output devices"
                    disabled={!isPlaybackAvailable || isLoadingDevices}
                    onClick={onRefreshDevices}
                    className="grid size-10 place-items-center rounded-control border border-border-control text-text-primary disabled:text-text-disabled"
                  >
                    <RefreshIcon />
                  </button>
                </div>
              </div>
              {deviceListError ? (
                <p className="text-body-sm text-error" role="alert">
                  {deviceListError}
                </p>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
