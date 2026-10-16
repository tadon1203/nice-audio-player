import { AppError } from "./app-error";

/** The domains whose commands the Tauri adapter reports with their own error class. */
export type NativeDomain = "session" | "playback" | "appearance" | "audioDevices";

/** A Backend command rejected with a structured `{ code }` reply, tagged with its domain. */
export abstract class NativeCommandError<
  TError extends { readonly code: string },
> extends AppError {
  public readonly domain: NativeDomain;
  /** The error value the Backend rejected with. */
  public readonly error: TError;

  public constructor(domain: NativeDomain, error: TError) {
    super(`Native ${domain} command failed: ${error.code}`);
    this.name = new.target.name;
    this.domain = domain;
    this.error = error;
  }

  public get code(): TError["code"] {
    return this.error.code;
  }
}
