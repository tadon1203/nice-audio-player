export function readNativeErrorCode(error: unknown): string | undefined {
  if (error instanceof Error && error.message.startsWith("nativeError:")) {
    return error.message.slice("nativeError:".length);
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
