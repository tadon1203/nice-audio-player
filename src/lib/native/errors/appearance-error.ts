import { NativeCommandError } from "./native-command-error";

/** An appearance command rejected with a structured `{ code }` reply. */
export class AppearanceError extends NativeCommandError<{ readonly code: string }> {
  public constructor(error: { readonly code: string }) {
    super("appearance", error);
  }
}
