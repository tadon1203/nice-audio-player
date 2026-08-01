import type { ValidatedAudioFile } from "@/bindings";

interface NowPlayingViewProps {
  validatedFile: ValidatedAudioFile | null;
  isValidatingFile: boolean;
  isFileSelectionDisabled: boolean;
  validationError: string | null;
  onSelectFile: () => void;
}

export function NowPlayingView({
  validatedFile,
  isValidatingFile,
  isFileSelectionDisabled,
  validationError,
  onSelectFile,
}: NowPlayingViewProps) {
  const hasFile = validatedFile !== null;
  const heading = hasFile ? validatedFile.fileName : "No audio selected";

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
          className={`now-playing-view__action mt-8 min-h-12 rounded-control px-5 py-3 font-interface text-body-md font-medium transition-opacity duration-150 ease-interface focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${hasFile ? "border border-border-control text-text-primary disabled:border-border-subtle disabled:bg-transparent disabled:text-text-disabled" : "bg-text-primary text-canvas disabled:bg-surface-pressed disabled:text-text-disabled"}`}
        >
          {isValidatingFile ? "Validating…" : hasFile ? "Choose another file" : "Choose audio file"}
        </button>
      </div>
    </section>
  );
}
