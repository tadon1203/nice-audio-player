import type { AudioOutputDevice, AudioOutputSelection, LibraryScanSnapshot } from "@/bindings";
import { Alert } from "@/components/ui/alert";
import { useScrollRegion } from "@/hooks/use-scroll-region";
import { AudioOutputSettings } from "./AudioOutputSettings";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { LibraryFoldersSettings } from "./LibraryFoldersSettings";
import { useLibraryRootSettings } from "./use-library-root-settings";
import { pageFrameClass, contentFrameClass } from "@/components/ui/layout";
import { typographyVariants } from "@/components/ui/typography";

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
    <div
      ref={setViewportElement}
      className="h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
      data-scroll-region
    >
      <div>
        <section className={`${pageFrameClass} py-[60px]`} aria-label="Settings">
          <div className={`${contentFrameClass} max-w-[1040px]`}>
            <header>
              <h1 className={typographyVariants({ role: "application-heading" })}>Settings</h1>
            </header>
            {scanError ? <Alert variant="error">{scanError}</Alert> : null}
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
