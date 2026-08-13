import { isLibraryCommandError } from "@/api/library";

export function formatLibraryQueryError(error: unknown, item: "albums" | "tracks"): string {
  const name = item === "albums" ? "Albums" : "Tracks";
  if (isLibraryCommandError(error)) {
    if (error.code === "libraryUnavailable") return "The library database is unavailable.";
    if (error.code === "persistenceFailed")
      return `The ${name.toLowerCase()} index could not be read.`;
    if (error.code === "taskFailed")
      return `The ${name.toLowerCase()} query could not be completed.`;
  }
  if (error instanceof Error && error.message.startsWith("Invalid library"))
    return `The ${name.toLowerCase()} response was invalid.`;
  return `${name} could not be loaded because the library service is unavailable.`;
}
