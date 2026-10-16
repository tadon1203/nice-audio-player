import { AppError } from "./app-error";

/** The command failed without a `{ code }` reply (the IPC itself failed). */
export class IpcError extends AppError {
  public readonly code = "ipcError";

  public constructor() {
    super("Native command failed without a reply");
    this.name = "IpcError";
  }
}
