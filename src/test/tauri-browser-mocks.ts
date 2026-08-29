import { mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";

export function installTauriBrowserMocks() {
  mockConvertFileSrc("windows");
  mockIPC((command, payload) => {
    const args: Record<string, unknown> =
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    if (command === "plugin:path|resolve_directory") {
      if (args.directory === 15) return "C:\\Users\\fixture\\AppData\\Local";
      throw new Error(`Unexpected path directory: ${String(args.directory)}`);
    }
    if (command === "plugin:path|join") {
      const paths = args.paths;
      if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string"))
        throw new Error("Unexpected path join payload");
      return paths.join("\\");
    }
    throw new Error(`Unexpected test IPC command: ${command}`);
  });
}
