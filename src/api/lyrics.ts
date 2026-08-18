import { commands, type LyricsCommandError, type LyricsResolution } from "@/bindings";

export function getLibraryTrackLyrics(trackId: string): Promise<LyricsResolution> {
  return commands.getLibraryTrackLyrics(trackId);
}

export function isLyricsCommandError(value: unknown): value is LyricsCommandError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    [
      "invalidId",
      "trackNotFound",
      "trackUnavailable",
      "libraryUnavailable",
      "persistenceFailed",
      "taskFailed",
    ].includes(String((value as { code: unknown }).code))
  );
}
