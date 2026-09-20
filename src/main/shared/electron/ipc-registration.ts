import { BrowserWindow, ipcMain } from "electron";
import { ipcRequestSchemas, ipcResponseSchemas } from "../../../shared/ipc";
import type { IpcChannel, IpcRequestMap, IpcResponseMap } from "../../../shared/ipc";
import { validateSender } from "../security";

export type IpcHandlerMap = {
  [Channel in IpcChannel]: (
    ...args: IpcRequestMap[Channel]
  ) => IpcResponseMap[Channel] | Promise<IpcResponseMap[Channel]>;
};

function registerChannel<Channel extends IpcChannel>(
  channel: Channel,
  handler: IpcHandlerMap[Channel],
  getTrustedWindow: () => BrowserWindow | null,
) {
  const requestSchema = ipcRequestSchemas[channel];
  const responseSchema = ipcResponseSchemas[channel];

  ipcMain.handle(
    channel,
    validateSender(async (...args: unknown[]) => {
      const request = requestSchema.safeParse(args);
      if (!request.success) throw new TypeError("Invalid IPC arguments");

      const invokeHandler = handler as (
        ...handlerArgs: IpcRequestMap[Channel]
      ) => IpcResponseMap[Channel] | Promise<IpcResponseMap[Channel]>;
      const response = await invokeHandler(...(request.data as IpcRequestMap[Channel]));
      const parsedResponse = responseSchema.safeParse(response);
      if (!parsedResponse.success) throw new TypeError("Invalid IPC response");
      return parsedResponse.data;
    }, getTrustedWindow),
  );
}

export function registerCommandHandlers(
  handlers: IpcHandlerMap,
  getTrustedWindow: () => BrowserWindow | null,
) {
  for (const channel of Object.keys(ipcRequestSchemas) as IpcChannel[]) {
    registerChannel(channel, handlers[channel] as IpcHandlerMap[typeof channel], getTrustedWindow);
  }
}
