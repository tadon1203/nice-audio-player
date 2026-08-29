import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import type { LibraryRoot, LibraryScanSnapshot } from "@/bindings";
import {
  cancelLibraryScan,
  isLibraryCommandError,
  listLibraryRoots,
  registerLibraryRoot,
  removeLibraryRoot,
  setLibraryRootEnabled,
  startLibraryScan,
} from "@/api/library";
import { diagnostics } from "@/lib/diagnostics";

export function useLibraryRootSettings(scan: LibraryScanSnapshot | null) {
  const [roots, setRoots] = useState<LibraryRoot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanning = scan?.state === "running";
  const reload = async (): Promise<boolean> => {
    try {
      setRoots(await listLibraryRoots());
      return true;
    } catch (cause) {
      diagnostics.error("frontend.settings.root_list_failed", { cause });
      setError("Library settings could not be loaded.");
      return false;
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function addFolder() {
    const path = await open({ directory: true, multiple: false });
    if (typeof path !== "string") return;
    setBusy(true);
    setError(null);
    try {
      await registerLibraryRoot(path);
      await reload();
    } catch (cause) {
      diagnostics.warn("frontend.settings.registration_failed", { cause });
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
  async function removeRoot(root: LibraryRoot): Promise<boolean> {
    setBusy(true);
    try {
      const removedRootId = root.id;
      await removeLibraryRoot(removedRootId);
      const refreshed = await reload();
      if (!refreshed) {
        setRoots((current) => current.filter((root) => root.id !== removedRootId));
        setError("The folder was removed, but library settings could not be refreshed.");
      }
      return true;
    } catch (cause) {
      diagnostics.warn("frontend.settings.removal_failed", {
        cause,
        context: { root_id: root.id },
      });
      setError(
        isLibraryCommandError(cause) && cause.code === "scanInProgress"
          ? "Wait for the current library scan to finish."
          : "The library folder could not be removed.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function formatOperationError(cause: unknown, operation: "scan" | "cancel" | "root"): string {
    if (!isLibraryCommandError(cause)) return "The library operation could not be completed.";
    const messages: Record<string, string> = {
      scanAlreadyRunning: "A library scan is already running.",
      noEnabledRoots: "Enable at least one library folder before scanning.",
      scanNotRunning: "There is no library scan to cancel.",
      rootMissing: "This library folder no longer exists.",
      scanInProgress: "Wait for the current library scan to finish.",
      libraryUnavailable: "The library database is unavailable.",
      persistenceFailed: "The library change could not be saved.",
      taskFailed: "The library task could not be completed.",
    };
    return messages[cause.code] ?? `The ${operation} operation could not be completed.`;
  }
  async function runScanAction() {
    setBusy(true);
    setError(null);
    try {
      if (scanning) await cancelLibraryScan();
      else await startLibraryScan();
      await reload();
    } catch (cause) {
      diagnostics.warn(
        scanning ? "frontend.settings.cancellation_failed" : "frontend.settings.scan_failed",
        { cause },
      );
      setError(formatOperationError(cause, scanning ? "cancel" : "scan"));
    } finally {
      setBusy(false);
    }
  }
  async function toggleRoot(root: LibraryRoot) {
    setBusy(true);
    setError(null);
    try {
      await setLibraryRootEnabled(root.id, !root.enabled);
      await reload();
    } catch (cause) {
      diagnostics.warn("frontend.settings.root_toggle_failed", {
        cause,
        context: { root_id: root.id },
      });
      setError(formatOperationError(cause, "root"));
    } finally {
      setBusy(false);
    }
  }
  return {
    roots,
    busy,
    error,
    scanning,
    addFolder,
    removeRoot,
    runScanAction,
    toggleRoot,
  };
}
