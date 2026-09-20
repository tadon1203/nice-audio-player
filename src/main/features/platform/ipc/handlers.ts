import { dialog, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../../../../shared/ipc";
import type { IpcHandlerMap } from "../../../shared/electron";

type PlatformHandlerMap = Pick<IpcHandlerMap, typeof IPC_CHANNELS.platform.selectLibraryDirectory>;

export function createPlatformHandlers(
  getTrustedWindow: () => BrowserWindow | null,
): PlatformHandlerMap {
  return {
    [IPC_CHANNELS.platform.selectLibraryDirectory]: async () => {
      const owner = getTrustedWindow();
      const result = owner
        ? await dialog.showOpenDialog(owner, { properties: ["openDirectory"] })
        : await dialog.showOpenDialog({ properties: ["openDirectory"] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  };
}
