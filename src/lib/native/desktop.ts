import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { command } from "./commands";

/** The desktop shell that is not a Backend command. Only `lib/native` imports Tauri. */
export { isTauri } from "@tauri-apps/api/core";

/** The window chrome the renderer draws itself (the window has no native decorations). */
export const windowChrome = {
  minimize: (): Promise<void> => command(() => getCurrentWindow().minimize()),
  toggleMaximize: (): Promise<void> => command(() => getCurrentWindow().toggleMaximize()),
  close: (): Promise<void> => command(() => getCurrentWindow().close()),
  /** Calls `listener` with the current state now and on each change. Returns the unsubscribe. */
  onMaximizedChange: (listener: (maximized: boolean) => void): (() => void) => {
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const sync = (): undefined =>
      void appWindow.isMaximized().then((value) => {
        if (!disposed) listener(value);
      });
    sync();
    void appWindow
      .onResized(sync)
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch(() => undefined);
    return (): void => {
      disposed = true;
      unlisten?.();
    };
  },
};

/** Opens the directory dialog. Resolves null when the user closes it. */
export async function selectDirectory(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}
