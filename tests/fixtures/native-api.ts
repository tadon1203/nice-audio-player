import type { Page } from "@playwright/test";
import type { AppEvent, commands } from "$lib/native";
import { idleResponses, libraryResponses, type LibraryData } from "./data";

type Commands = typeof commands;
export type CommandName = keyof Commands;
type Result<Name extends CommandName> = Awaited<ReturnType<Commands[Name]>>;
/** The named arguments the renderer sent to the command, as the backend would receive them. */
// oxlint-disable-next-line typescript/no-explicit-any
export type CommandArgs = Record<string, any>;
type Response<Name extends CommandName> =
  | Result<Name>
  | ((args: CommandArgs) => Result<Name> | Promise<Result<Name>>);

type Reply = { value: unknown } | { error: unknown };

declare global {
  interface Window {
    /** Node side of the IPC bridge, bound by `installNativeApi`. */
    __nativeInvoke?: (command: string, args: unknown) => Promise<Reply>;
    __emitNativeEvent?: (name: string, payload: unknown) => void;
  }
}

/**
 * The page side of Tauri's IPC: what `@tauri-apps/api` reaches through `window.__TAURI_INTERNALS__`.
 * The real native adapter runs on top of it, so error wrapping, event-name checks and argument
 * mapping are exercised. It holds no domain logic: every command is forwarded to Node, where the
 * test says what it answers. It runs in the page, so it uses only what it defines itself.
 */
function installIpcBridge() {
  const callbacks = new Map<number, (data: unknown) => void>();
  const listeners = new Map<string, number[]>();
  let nextCallbackId = 1;

  const internals = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    callbacks,
    transformCallback(callback?: (data: unknown) => void, once = false) {
      const id = nextCallbackId++;
      callbacks.set(id, (data) => {
        if (once) callbacks.delete(id);
        callback?.(data);
      });
      return id;
    },
    unregisterCallback: (id: number) => void callbacks.delete(id),
    runCallback: (id: number, data: unknown) => callbacks.get(id)?.(data),
    async invoke(command: string, args: Record<string, unknown> = {}) {
      if (command === "plugin:event|listen") {
        const event = args.event as string;
        const handler = args.handler as number;
        listeners.set(event, [...(listeners.get(event) ?? []), handler]);
        return handler;
      }
      if (command === "plugin:event|unlisten") {
        const event = args.event as string;
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((id) => id !== args.eventId),
        );
        return null;
      }
      // Window chrome is the one part of the bridge that is not the backend's contract.
      if (command.startsWith("plugin:window|")) {
        return command === "plugin:window|is_maximized" ? false : null;
      }
      const reply = await window.__nativeInvoke!(command, args);
      if ("error" in reply) throw reply.error;
      return reply.value;
    },
  };
  Object.defineProperty(window, "__TAURI_INTERNALS__", { value: internals });
  Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
    value: { unregisterListener: (_event: string, id: number) => callbacks.delete(id) },
  });
  Object.defineProperty(window, "isTauri", { value: true });
  window.__emitNativeEvent = (name, payload) => {
    for (const id of listeners.get(name) ?? []) callbacks.get(id)?.({ event: name, id, payload });
  };
}

const toCommandName = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

type Responder = (args: CommandArgs) => unknown;

/**
 * What a test holds of the fake backend: it says what each command answers, emits events, and
 * reads which commands the renderer sent with which arguments.
 */
export class Native {
  readonly #page: Page;
  readonly #responders = new Map<string, Responder>();
  readonly #calls: { command: string; args: CommandArgs }[] = [];

  constructor(page: Page) {
    this.#page = page;
  }

  /** Binds the Node side of the bridge and installs the page side before the app loads. */
  async install() {
    await this.#page.exposeFunction(
      "__nativeInvoke",
      async (command: string, args: CommandArgs): Promise<Reply> => {
        this.#calls.push({ command, args });
        const responder = this.#responders.get(command);
        if (responder === undefined) return { error: { code: "unmockedCommand", command } };
        try {
          return { value: await responder(args) };
        } catch (error) {
          return { error };
        }
      },
    );
    await this.#page.addInitScript(installIpcBridge);
  }

  /** Sets what a command answers: a value, or a function of the arguments it was sent. */
  respond<Name extends CommandName>(name: Name, response: Response<Name>) {
    this.#responders.set(
      toCommandName(name),
      typeof response === "function" ? (response as Responder) : () => response,
    );
  }

  /** Makes a command reject the way the backend does, with a structured `{ code }`. */
  fail(name: CommandName, code: string) {
    this.#responders.set(toCommandName(name), () => {
      throw { code };
    });
  }

  /** Answers the folder picker. */
  respondToFolderPicker(path: string | null) {
    this.#responders.set("plugin:dialog|open", () => path);
  }

  /** Sends an event to the renderer, as the backend does on `app:event`. */
  async emit(event: AppEvent) {
    await this.#page.evaluate((payload) => window.__emitNativeEvent?.("app:event", payload), event);
  }

  /** Arguments of every call to a command, oldest first. */
  callsTo(name: CommandName): CommandArgs[] {
    const command = toCommandName(name);
    return this.#calls.filter((call) => call.command === command).map((call) => call.args);
  }
}

type InstallOptions = {
  /** The Library the list commands answer from; the default is `testLibrary()`. */
  library?: LibraryData;
};

/** Installs the fake backend: an idle app over the given Library, ready for the test to script. */
export async function installNativeApi(page: Page, options: InstallOptions = {}) {
  const native = new Native(page);
  await native.install();
  for (const [name, response] of Object.entries(idleResponses())) {
    native.respond(name as CommandName, response as never);
  }
  for (const [name, response] of Object.entries(libraryResponses(options.library))) {
    native.respond(name as CommandName, response as never);
  }
  native.respondToFolderPicker("C:/More Music");
  return native;
}
