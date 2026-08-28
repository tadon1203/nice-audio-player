import * as tauriLog from "@tauri-apps/plugin-log";

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";
export type DiagnosticContextValue = string | number | boolean;
export interface DiagnosticOptions {
  cause?: unknown;
  context?: Record<string, DiagnosticContextValue>;
}

const MAX_STRING_LENGTH = 1_024;
const sensitiveKey =
  /password|token|secret|authorization|cookie|credential|path|file|filename|url|uri/i;
function sanitizeString(value: string): string {
  const protectedUrls: string[] = [];
  const withProtectedUrls = value.replace(/(?:https?|file):\/\/[^\s"'<>]+/gi, (url) => {
    const sanitized = /^file:/i.test(url) ? "[redacted]" : url.split(/[?#]/, 1)[0];
    const marker = `__DIAGNOSTIC_URL_${protectedUrls.length}__`;
    protectedUrls.push(sanitized);
    return marker;
  });
  const withoutLocations = withProtectedUrls.replace(
    /(?:[A-Za-z]:[\\/][^\s"'<>]+|\\\\[^\s"'<>]+|\/(?:[^\s"'<>/]+\/)*[^\s"'<>/]+)/g,
    "[redacted]",
  );
  return withoutLocations
    .replace(
      /__DIAGNOSTIC_URL_(\d+)__/g,
      (_match, index: string) => protectedUrls[Number(index)] ?? "[redacted]",
    )
    .slice(0, MAX_STRING_LENGTH);
}

function sanitizeKey(key: string): string {
  return key.slice(0, MAX_STRING_LENGTH);
}

function classifyCause(cause: unknown): Record<string, string> {
  if (cause instanceof Error) {
    return {
      error_name: sanitizeString(cause.name),
      error_message: sanitizeString(cause.message),
    };
  }
  if (typeof cause === "string") return { error_message: sanitizeString(cause) };
  if (cause !== null && typeof cause === "object") {
    const code = Reflect.get(cause, "code");
    return typeof code === "string" || typeof code === "number"
      ? { error_code: sanitizeString(String(code)) }
      : { error_type: "object" };
  }
  return { error_type: cause === null ? "null" : typeof cause };
}

function normalizeOptions(options?: DiagnosticOptions): { keyValues?: Record<string, string> } {
  const keyValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(options?.context ?? {})) {
    keyValues[sanitizeKey(key)] = sensitiveKey.test(key)
      ? "[redacted]"
      : sanitizeString(String(value));
  }
  if (options?.cause !== undefined) Object.assign(keyValues, classifyCause(options.cause));
  return Object.keys(keyValues).length > 0 ? { keyValues } : {};
}

function report(level: DiagnosticLevel, event: string, options?: DiagnosticOptions): void {
  if (level === "debug" && import.meta.env.PROD) return;
  const logger = tauriLog[level];
  void logger(sanitizeString(event), normalizeOptions(options)).catch(() => {});
}

export const diagnostics = {
  debug: (event: string, options?: DiagnosticOptions): void => report("debug", event, options),
  info: (event: string, options?: DiagnosticOptions): void => report("info", event, options),
  warn: (event: string, options?: DiagnosticOptions): void => report("warn", event, options),
  error: (event: string, options?: DiagnosticOptions): void => report("error", event, options),
};

export const __diagnostics = { sanitizeString, classifyCause, normalizeOptions };
