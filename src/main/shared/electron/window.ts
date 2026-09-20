import { BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { secureWindow } from "../security";

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 640,
    minHeight: 560,
    title: "Nice Audio Player",
    show: false,
    webPreferences: {
      preload: fileURLToPath(new URL("../preload/index.cjs", import.meta.url)),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = window;
  secureWindow(window);
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  await window.loadURL(devServerUrl ?? "nice-player://renderer/");
  return window;
}
