import { app, BrowserWindow, protocol } from "electron";
import { ipcEventSchemas } from "../../shared/ipc";
import { createLibraryHandlers } from "../../main/features/library";
import { createPlatformHandlers } from "../../main/features/platform";
import { createPlaybackHandlers } from "../../main/features/playback";
import {
  createMainWindow,
  getMainWindow,
  registerCommandHandlers,
  resolveRendererRoot,
  serveArtworkRequest,
  serveRendererRequest,
} from "../../main/shared/electron";
import type { IpcHandlerMap } from "../../main/shared/electron";
import type { NativeBackend } from "../../main/shared/native-backend";
import { loadNativeBinding } from "../../main/shared/native-backend";
import { readNativeErrorCode } from "../../main/shared/security";

protocol.registerSchemesAsPrivileged([
  { scheme: "nice-player", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: "nice-artwork", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (process.platform === "win32") app.setAppUserModelId("com.niceaudioplayer.app");

let backend: NativeBackend | undefined;
let eventForwarder: Promise<void> | undefined;
let quitting = false;

function registerIpc(nativeBackend: NativeBackend, getTrustedWindow: () => BrowserWindow | null) {
  const handlers: IpcHandlerMap = {
    ...createPlaybackHandlers(nativeBackend),
    ...createLibraryHandlers(nativeBackend),
    ...createPlatformHandlers(getTrustedWindow),
  };
  registerCommandHandlers(handlers, getTrustedWindow);
}

async function forwardBackendEvents(nativeBackend: NativeBackend): Promise<void> {
  for (;;) {
    try {
      const event = await nativeBackend.nextEvent();
      if (ipcEventSchemas["app:event"].safeParse(event).success) {
        getMainWindow()?.webContents.send("app:event", event);
      }
    } catch (error) {
      if (quitting && readNativeErrorCode(error) === "backendClosed") return;
      throw error;
    }
  }
}

app
  .whenReady()
  .then(async () => {
    if (process.env.NICE_AUDIO_PLAYER_E2E === "1") {
      const dataDir = process.env.NICE_AUDIO_PLAYER_TEST_DATA_DIR;
      if (dataDir) app.setPath("userData", dataDir);
    }
    protocol.handle("nice-artwork", (request) =>
      serveArtworkRequest(app.getPath("userData"), request.url),
    );
    if (process.env.ELECTRON_RENDERER_URL === undefined) {
      protocol.handle("nice-player", (request) =>
        serveRendererRequest(resolveRendererRoot(app.getAppPath()), request.url),
      );
    }
    const { NativeBackend } = loadNativeBinding();
    const nativeBackend = await NativeBackend.open(app.getPath("userData"));
    backend = nativeBackend;
    registerIpc(nativeBackend, getMainWindow);
    eventForwarder = forwardBackendEvents(nativeBackend);
    eventForwarder.catch((error: unknown) => {
      console.error("[main] backend event forwarding failed", error);
      if (!quitting) app.exit(1);
    });
    await createMainWindow();
  })
  .catch((error: unknown) => {
    console.error("[main] startup failed", error);
    app.exit(1);
  });

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void (async () => {
    if (backend) await backend.shutdown();
    if (eventForwarder) await eventForwarder;
    app.exit(0);
  })().catch((error: unknown) => {
    console.error("[main] shutdown failed", error);
    app.exit(1);
  });
});
