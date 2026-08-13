import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import type {
  AudioOutputDevice,
  AudioOutputSelection,
  LibraryRoot,
  LibraryScanSnapshot,
} from "@/bindings";
import {
  cancelLibraryScan,
  getLibraryScanState,
  isLibraryCommandError,
  listLibraryRoots,
  listenToLibraryScanProgress,
  removeLibraryRoot,
  registerLibraryRoot,
  setLibraryRootEnabled,
  startLibraryScan,
} from "@/api/library";

interface SettingsViewProps {
  outputDevices: AudioOutputDevice[] | null;
  selectedOutput: AudioOutputSelection;
  onOutputSelectionChange: (value: AudioOutputSelection) => void;
  onRefreshDevices: () => void;
  outputDisabled?: boolean;
}
export function SettingsView({
  outputDevices,
  selectedOutput,
  onOutputSelectionChange,
  onRefreshDevices,
  outputDisabled = false,
}: SettingsViewProps) {
  const [roots, setRoots] = useState<LibraryRoot[]>([]);
  const [scan, setScan] = useState<LibraryScanSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRoot, setConfirmRoot] = useState<LibraryRoot | null>(null);
  const reload = () =>
    void Promise.all([listLibraryRoots(), getLibraryScanState()])
      .then(([nextRoots, nextScan]) => {
        setRoots(nextRoots);
        setScan(nextScan);
      })
      .catch(() => setError("Library settings could not be loaded."));
  useEffect(reload, []);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void listenToLibraryScanProgress((snapshot) => {
      if (active) setScan(snapshot);
    }).then((fn) => {
      if (active) unsubscribe = fn;
      else fn();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  const scanning = scan?.state === "running";
  async function addFolder() {
    const path = await open({ directory: true, multiple: false });
    if (typeof path !== "string") return;
    setBusy(true);
    setError(null);
    try {
      await registerLibraryRoot(path);
      try {
        await startLibraryScan();
      } catch {
        setError("Folder was added, but the scan could not start.");
      }
      reload();
    } catch (cause) {
      if (!isLibraryCommandError(cause)) setError("The folder could not be added.");
      else {
        const messages: Record<string, string> = {
          invalidRoot: "The selected folder is invalid.",
          rootNotFound: "The selected folder could not be found.",
          rootNotDirectory: "The selected path is not a folder.",
          canonicalizationFailed: "The folder path could not be resolved.",
          duplicateRoot: "This folder is already in your library.",
          overlappingRoot: "This folder overlaps an existing library folder.",
          scanInProgress: "Wait for the current library scan to finish.",
          libraryUnavailable: "The library database is unavailable.",
          persistenceFailed: "The library folder could not be saved.",
          taskFailed: "The library task failed.",
        };
        setError(messages[cause.code] ?? "The folder could not be added.");
      }
    } finally {
      setBusy(false);
    }
  }
  async function removeRoot() {
    if (!confirmRoot) return;
    setBusy(true);
    try {
      await removeLibraryRoot(confirmRoot.id);
      setConfirmRoot(null);
      reload();
    } catch (cause) {
      setError(
        isLibraryCommandError(cause) && cause.code === "scanInProgress"
          ? "Wait for the current library scan to finish."
          : "The library folder could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-view" aria-label="Settings">
      <header>
        <h1>Settings</h1>
      </header>
      <section className="settings-view__section">
        <div className="settings-view__section-head">
          <div>
            <h2>Library folders</h2>
            <p>Choose locations to include in your music library.</p>
          </div>
          <div>
            <button
              type="button"
              disabled={busy || scanning}
              onClick={() =>
                void (scanning ? cancelLibraryScan().then(reload) : startLibraryScan().then(reload))
              }
            >
              {scanning ? "Cancel scan" : "Rescan library"}
            </button>
            <button type="button" disabled={busy || scanning} onClick={() => void addFolder()}>
              Add folder
            </button>
          </div>
        </div>
        {error ? (
          <p role="alert" className="settings-view__error">
            {error}
          </p>
        ) : null}
        <div className="settings-view__roots">
          {roots.map((root) => (
            <div key={root.id}>
              <span>
                <strong>{root.path}</strong>
                <small>{root.enabled ? "Included in scans" : "Excluded from scans"}</small>
              </span>
              <div>
                <button
                  type="button"
                  disabled={busy || scanning}
                  onClick={() => void setLibraryRootEnabled(root.id, !root.enabled).then(reload)}
                >
                  {root.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  disabled={busy || scanning}
                  onClick={() => setConfirmRoot(root)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {roots.length === 0 ? <p>No library folders added.</p> : null}
        </div>
        {scan ? (
          <p className="settings-view__scan">
            {scanning
              ? `Scanning: ${scan.indexedCount} tracks indexed`
              : "Library scan is up to date."}
          </p>
        ) : null}
      </section>
      {confirmRoot ? (
        <div className="settings-view__dialog" role="dialog" aria-modal="true">
          <h2>Remove library folder?</h2>
          <p>{confirmRoot.path}</p>
          <p>This removes index entries but does not delete music files.</p>
          <button type="button" onClick={() => setConfirmRoot(null)}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void removeRoot()}>
            Remove
          </button>
        </div>
      ) : null}
      <section className="settings-view__section">
        <h2>Audio</h2>
        <p>Configure playback output and device settings.</p>
        <div className="settings-view__output">
          <label>
            Output device
            <select
              value={selectedOutput.kind === "device" ? selectedOutput.deviceId : "systemDefault"}
              disabled={outputDisabled}
              onChange={(event) =>
                onOutputSelectionChange(
                  event.currentTarget.value === "systemDefault"
                    ? { kind: "systemDefault" }
                    : { kind: "device", deviceId: event.currentTarget.value },
                )
              }
            >
              <option value="systemDefault">System default</option>
              {outputDevices?.map((device) => (
                <option value={device.id} key={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={outputDisabled} onClick={onRefreshDevices}>
            Refresh
          </button>
        </div>
      </section>
    </section>
  );
}
