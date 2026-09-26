export class NativeCommandError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "NativeCommandError";
  }
}

/** Reads the structured `{ code }` a backend command rejected with, if any. */
export function nativeErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

/**
 * Looks up a user-facing message for an error code. `messages` is keyed by the
 * generated error-code union, so the compiler rejects missing or removed codes;
 * unknown runtime codes fall back to `fallback`.
 */
export function messageForCode<Code extends string>(
  messages: Readonly<Record<Code, string>>,
  code: string | null,
  fallback: string,
): string {
  return code !== null && Object.hasOwn(messages, code) ? messages[code as Code] : fallback;
}
