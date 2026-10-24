import type { Page } from "@playwright/test";
import type { BackendMessage, CommandError, commands } from "#lib/native/bindings";
import {
  idleResponses,
  idleTopicState,
  libraryResponses,
  type LibraryData,
  type TopicState,
} from "./data";

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
    __emitChannelMessage?: (channelId: number, bytes: number[]) => void;
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
  window.__emitChannelMessage = (channelId, bytes): void =>
    deliver(channelId, new Uint8Array(bytes).buffer);
  window.__emitChannelValue = deliver;
}

const toCommandName = (name: string): string =>
  name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

type Responder = (args: CommandArgs) => unknown;

/**
 * What a test holds of the fake backend: it says what each command answers, sends the Backend's
 * messages on the channel `connect` registered, and reads which commands the renderer sent with
 * which arguments.
 */
export class Native {
  readonly #page: Page;
  readonly #responders = new Map<string, Responder>();
  readonly #calls: { command: string; args: CommandArgs }[] = [];
  /** The current value of every state topic, as the Backend holds it; `connect` answers with it. */
  #state: TopicState = idleTopicState();

  public constructor(page: Page) {
    this.#page = page;
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
    // A reloaded page connects again and gets the current state, as the Backend answers it.
    this.respond("appConnect", () => this.#connectMessages());
  }

  /** Every topic as a state message, which is what `connect` answers with. */
  #connectMessages(): BackendMessage[] {
    return (Object.keys(this.#state) as (keyof TopicState)[]).map(
      (topic) =>
        ({
          kind: "state",
          revision: this.#state[topic].revision,
          topic,
          value: this.#state[topic].value,
        }) as BackendMessage,
    );
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
   * becomes the topic's value, so a later `connect` answers with it. Before the page connects there
   * is no channel, so the message only updates that value.
   */
  public async send(message: BackendMessage): Promise<void> {
    if (message.kind === "state") {
      this.#state = {
        ...this.#state,
        [message.topic]: { revision: message.revision, value: message.value },
      };
    }
    const channelId = this.#channelId("appConnect", "channel");
    if (channelId === undefined) return;
    await this.#page.evaluate(([id, value]) => window.__emitChannelValue?.(id, value), [
      channelId,
      message,
    ] as const);
  }

  /** Sends a track the Backend skipped because it could not play it, by its title. */
  public async skipTrack(title: string | null): Promise<void> {
    await this.send({ kind: "trackSkipped", title });
  }

  /**
   * Publishes a new value of a state topic: the next revision of it, sent as a state message.
   * Returns that revision, so a command that answers with the same value can carry it.
   */
  public async publish<Topic extends keyof TopicState>(
    topic: Topic,
    value: TopicState[Topic]["value"],
  ): Promise<number> {
    const revision = this.revisionOf(topic);
    const next = revision + 1;
    await this.send({ kind: "state", revision: next, topic, value } as BackendMessage);
    return next;
  }

  /** The revision of a state topic as the Backend last published it. */
  public revisionOf(topic: keyof TopicState): number {
    return this.#state[topic].revision;
  }

  /** Sends one binary message down the channel the renderer passed to its latest call of `name`. */
  public async emitChannelMessage(
    name: CommandName,
    argument: string,
    bytes: number[],
  ): Promise<void> {
    const id = this.#channelId(name, argument);
    if (id === undefined) throw new Error(`no channel was passed to ${name}`);
    await this.#page.evaluate(
      ([channelId, payload]) => window.__emitChannelMessage?.(channelId, payload),
      [id, bytes] as const,
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
