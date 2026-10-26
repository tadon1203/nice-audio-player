import type { Page } from "@playwright/test";
import type { BackendMessage, CommandError, commands } from "#lib/native/bindings";
import { idleMessages, idleResponses, libraryResponses, type LibraryData } from "./data";

type Commands = typeof commands;
export type CommandName = keyof Commands;
/** The named arguments the renderer sent to the command, as the backend would receive them. */
// oxlint-disable-next-line typescript/no-explicit-any
export type CommandArgs = Record<string, any>;
type Response<Name extends CommandName> =
  | Awaited<ReturnType<Commands[Name]>>
  | ((args: CommandArgs) => unknown);

type Reply = { value: unknown } | { error: unknown };

/** The messages that carry a state: the Backend pushes each one whole when it changes. */
type StateMessage = Extract<
  BackendMessage,
  { kind: "player" | "queue" | "library" | "waveform" | "appearance" }
>;

declare global {
  interface Window {
    /** Node side of the IPC bridge, bound by `installNativeApi`. */
    __nativeInvoke?: (command: string, args: unknown) => Promise<Reply>;
    __emitChannelValue?: (channelId: number, value: unknown) => void;
  }
}

/**
 * The page side of Tauri's IPC: what `@tauri-apps/api` reaches through `window.__TAURI_INTERNALS__`.
 * The real native adapter runs on top of it, so error wrapping, event-name checks and argument
 * mapping are exercised. It holds no domain logic: every command is forwarded to Node, where the
 * test says what it answers. It runs in the page, so it uses only what it defines itself.
 */
function installIpcBridge(): void {
  const callbacks = new Map<number, (data: unknown) => void>();
  const listeners = new Map<string, number[]>();
  let nextCallbackId = 1;

  const internals = {
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
    callbacks,
    transformCallback(callback?: (data: unknown) => void, once = false): number {
      const id = nextCallbackId++;
      callbacks.set(id, (data) => {
        if (once) callbacks.delete(id);
        callback?.(data);
      });
      return id;
    },
    unregisterCallback: (id: number): undefined => void callbacks.delete(id),
    runCallback: (id: number, data: unknown): void | undefined => callbacks.get(id)?.(data),
    async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
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
  // A Tauri channel numbers its messages so they are delivered in order.
  const channelIndexes = new Map<number, number>();
  const deliver = (channelId: number, message: unknown): void => {
    const index = channelIndexes.get(channelId) ?? 0;
    channelIndexes.set(channelId, index + 1);
    callbacks.get(channelId)?.({ index, message });
  };
  window.__emitChannelValue = deliver;
}

const toCommandName = (name: string): string =>
  name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

type Responder = (args: CommandArgs) => unknown;

/**
 * What a test holds of the fake backend: it says what each command answers, sends the Backend's
 * messages on the channel `connect` registered, and reads which commands the renderer sent with
 * which arguments. A command answers only whether it was accepted; the state it causes is sent as
 * a message, with `publish`.
 */
export class Native {
  readonly #page: Page;
  readonly #responders = new Map<string, Responder>();
  readonly #calls: { command: string; args: CommandArgs }[] = [];
  /** The newest message of each state kind, as the Backend holds it; `connect` sends them first. */
  readonly #latest = new Map<BackendMessage["kind"], BackendMessage>();

  public constructor(page: Page) {
    this.#page = page;
    for (const message of idleMessages()) this.#latest.set(message.kind, message);
  }

  /** Binds the Node side of the bridge and installs the page side before the app loads. */
  public async install(): Promise<void> {
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
    // A reloaded page connects again and gets the current state, as the Backend sends it: the latest
    // message of each state kind, on the channel the connect call passed.
    this.respond("appConnect", () => this.#deliver(...this.#latest.values()));
  }

  /** Sets what a command answers: a value, or a function of the arguments it was sent. */
  public respond<Name extends CommandName>(name: Name, response: Response<Name>): void {
    this.#responders.set(
      toCommandName(name),
      typeof response === "function" ? (response as Responder) : (): unknown => response,
    );
  }

  /** Makes a command reject the way the backend does, with its structured reply. */
  public fail(name: CommandName, reply: CommandError): void {
    this.#responders.set(toCommandName(name), () => {
      throw reply;
    });
  }

  /** Answers the directory picker. */
  public respondToDirectoryPicker(path: string | null): void {
    this.#responders.set("plugin:dialog|open", () => path);
  }

  /**
   * Sends a message on the channel `connect` registered, as the Backend does. A state message also
   * becomes the newest of its kind, so a later `connect` sends it. Before the page connects there is
   * no channel, so the message only updates that value.
   */
  public async send(message: BackendMessage): Promise<void> {
    if (message.kind !== "position" && message.kind !== "trackSkipped") {
      this.#latest.set(message.kind, message);
    }
    await this.#deliver(message);
  }

  /** Sends a track the Backend skipped because it could not play it, by its title. */
  public async skipTrack(title: string | null): Promise<void> {
    await this.send({ kind: "trackSkipped", value: { title } });
  }

  /**
   * Pushes a new value of a state, as the Backend does when the state changes: the whole value, sent
   * as a message of its kind.
   */
  public async publish<Kind extends StateMessage["kind"]>(
    kind: Kind,
    value: Extract<StateMessage, { kind: Kind }>["value"],
  ): Promise<void> {
    await this.send({ kind, value } as StateMessage);
  }

  /**
   * Delivers `messages`, in order, as the next messages of the channel the latest `connect` passed.
   * They go in one page call, as the Backend's connect answer used to arrive in one reply.
   */
  async #deliver(...messages: BackendMessage[]): Promise<void> {
    const channelId = this.#channelId("appConnect", "channel");
    if (channelId === undefined || messages.length === 0) return;
    await this.#page.evaluate(
      ([id, batch]) => {
        for (const message of batch) window.__emitChannelValue?.(id, message);
      },
      [channelId, messages] as const,
    );
  }

  /** Delivers `message` as the next message of the channel that `argument` of `name` passed. */
  public async emitChannelValue(
    name: CommandName,
    argument: string,
    message: unknown,
  ): Promise<void> {
    const id = this.#channelId(name, argument);
    if (id === undefined) throw new Error(`no channel was passed to ${name}`);
    await this.#page.evaluate(
      ([channelId, payload]) => window.__emitChannelValue?.(channelId, payload),
      [id, message] as const,
    );
  }

  /** The id of the channel the renderer passed as `argument` to its latest call of `name`. */
  #channelId(name: CommandName, argument: string): number | undefined {
    // A channel reaches the bridge as the object Playwright serialises; its `id` names the callback.
    const channel = this.callsTo(name).at(-1)?.[argument] as { id?: number } | string | undefined;
    const id =
      typeof channel === "string" ? Number(channel.replace("__CHANNEL__:", "")) : channel?.id;
    return id !== undefined && Number.isInteger(id) ? id : undefined;
  }

  /** Arguments of every call to a command, oldest first. */
  public callsTo(name: CommandName): CommandArgs[] {
    const command = toCommandName(name);
    return this.#calls.filter((call) => call.command === command).map((call) => call.args);
  }
}

interface InstallOptions {
  /** The Library the list commands answer from; the default is `testLibrary()`. */
  library?: LibraryData;
}

/** Installs the fake backend: an idle app over the given Library, ready for the test to script. */
export async function installNativeApi(page: Page, options: InstallOptions = {}): Promise<Native> {
  const native = new Native(page);
  await native.install();
  for (const [name, response] of Object.entries(idleResponses())) {
    native.respond(name as CommandName, response as never);
  }
  for (const [name, response] of Object.entries(libraryResponses(options.library))) {
    native.respond(name as CommandName, response as never);
  }
  native.respondToDirectoryPicker("C:/More Music");
  return native;
}
