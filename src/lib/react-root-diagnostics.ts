import type { ErrorInfo } from "react";
import { diagnostics } from "./diagnostics";

export interface ReactRootDiagnosticsOptions {
  onUncaughtError: (error: unknown, errorInfo: ErrorInfo) => void;
  onCaughtError: (error: unknown, errorInfo: ErrorInfo) => void;
  onRecoverableError: (error: unknown, errorInfo: ErrorInfo) => void;
}

function report(
  event: string,
  level: "warn" | "error",
  error: unknown,
  errorInfo: ErrorInfo,
): void {
  diagnostics[level](event, {
    cause: error,
    context: { component_stack: errorInfo.componentStack ?? "" },
  });
}

export function createProductionRootDiagnostics(): ReactRootDiagnosticsOptions {
  return {
    onUncaughtError: (error, errorInfo) =>
      report("frontend.react.uncaught_error", "error", error, errorInfo),
    onCaughtError: (error, errorInfo) =>
      report("frontend.react.caught_error", "error", error, errorInfo),
    onRecoverableError: (error, errorInfo) =>
      report("frontend.react.recoverable_error", "warn", error, errorInfo),
  };
}

export function createRootOptions(mode: string): ReactRootDiagnosticsOptions | undefined {
  return mode === "production" ? createProductionRootDiagnostics() : undefined;
}
