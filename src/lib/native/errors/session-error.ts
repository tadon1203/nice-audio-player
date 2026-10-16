import { NativeCommandError } from "./native-command-error";

/** The connect command rejected with a structured `{ code }` reply. */
export class SessionError extends NativeCommandError<{ readonly code: string }> {
  public constructor(error: { readonly code: string }) {
    super("session", error);
  }
}
