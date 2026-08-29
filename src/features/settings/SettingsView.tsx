import type { AudioOutputDevice, AudioOutputSelection, LibraryScanSnapshot } from "@/bindings";
import { Alert } from "@/components/ui/alert";
import { useScrollRegion } from "@/hooks/use-scroll-region";
import { AudioOutputSettings } from "./AudioOutputSettings";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { LibraryFoldersSettings } from "./LibraryFoldersSettings";
import { useLibraryRootSettings } from "./use-library-root-settings";

interface SettingsViewProps {
  outputDevices: AudioOutputDevice[] | null;
  selectedOutput: AudioOutputSelection;
  onOutputSelectionChange: (value: AudioOutputSelection) => void;
  onRefreshDevices: () => void;
  outputDisabled?: boolean;
  scan?: LibraryScanSnapshot | null;
  scanError?: string | null;
}

export function SettingsView({
  outputDevices,
  selectedOutput,
  onOutputSelectionChange,
  onRefreshDevices,
  outputDisabled = false,
  scan = null,
  scanError = null,
}: SettingsViewProps) {
  const { setViewportElement } = useScrollRegion();
  const library = useLibraryRootSettings(scan);
  return (
    <div ref={setViewportElement} className="settings-scroll-surface" data-scroll-region>
      <div>
        <section className="settings-view page-frame" aria-label="Settings">
          <div className="settings-view__content content-frame">
            <header>
              <h1 className="type-application-heading">Settings</h1>
            </header>
            {scanError ? <Alert className="inline-notice--error">{scanError}</Alert> : null}
            <LibraryFoldersSettings scan={scan} {...library} />
            <AudioOutputSettings
              outputDevices={outputDevices}
              selectedOutput={selectedOutput}
              onOutputSelectionChange={onOutputSelectionChange}
              onRefreshDevices={onRefreshDevices}
              outputDisabled={outputDisabled}
            />
            <KeyboardShortcutsSettings />
          </div>
        </section>
      </div>
    </div>
  );
}
