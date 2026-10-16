import type { AudioDeviceListError } from "../bindings";
import { NativeCommandError } from "./native-command-error";

/** The output device list command rejected with a structured `{ code }` reply. */
export class AudioDevicesError extends NativeCommandError<AudioDeviceListError> {
  public constructor(error: AudioDeviceListError) {
    super("audioDevices", error);
  }
}
