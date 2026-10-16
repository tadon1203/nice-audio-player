import { AppError } from "./app-error";

/** The renderer runs outside the desktop app, so there is no native bridge. */
export class NativeBridgeUnavailableError extends AppError {
  public readonly code = "nativeBridgeUnavailable";

  public constructor() {
    super("Native application bridge is unavailable");
    this.name = "NativeBridgeUnavailableError";
  }
}
