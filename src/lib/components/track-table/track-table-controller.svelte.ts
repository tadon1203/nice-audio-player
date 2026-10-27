import { goto } from "$app/navigation";
import { type TrackId } from "#lib/native/bindings";
import type { App } from "#lib/app/app.svelte";
import type { TrackTableRow } from "./track-columns";
import { TrackRowStates } from "./track-row-states";

/** Whether the event came from a control inside the row, which handles its own input. */
function isInteractiveTarget(event: Event): boolean {
  const target = event.target;
  return (
    target instanceof Element &&
    target.closest("button, a, input, select, textarea, [role='button'], [data-row-action]") !==
      null
  );
}

/**
 * The track table's behaviour: row clicks and keys, the context-menu row, and the actions that the
 * row and the menu run. `play` starts a track in the page's context. Construct it while a
 * component initialises; `rows` is read live.
 */
export class TrackTableController {
  readonly #app: App;
  readonly #rows: () => readonly TrackTableRow[];
  readonly #play: (trackId: TrackId) => void;
  #menuRow = $state<TrackTableRow | null>(null);

  public constructor(
    app: App,
    rows: () => readonly TrackTableRow[],
    play: (trackId: TrackId) => void,
  ) {
    this.#app = app;
    this.#rows = rows;
    this.#play = play;
  }

  /** The row the context menu was opened on, or `null` while no menu row is set. */
  public get menuTrack(): TrackTableRow | null {
    return this.#menuRow;
  }

  /** A click on the row itself: play it, or resume it when it is paused. */
  public readonly onRowClick = (event: MouseEvent, trackId: TrackId): void => {
    if (isInteractiveTarget(event)) return;
    this.#activate(trackId);
  };

  /** Enter or Space on the row itself does what a click does. Keys from its controls stay theirs. */
  public readonly onRowKeydown = (event: KeyboardEvent, trackId: TrackId): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (isInteractiveTarget(event)) return;
    event.preventDefault();
    this.#activate(trackId);
  };

  /** Resolves the row under a right-click; the spacer rows have none, so no menu opens there. */
  public readonly onContextMenu = (event: MouseEvent): void => {
    const target = event.target;
    const id =
      target instanceof Element
        ? (target.closest<HTMLElement>("tr[data-row-id]")?.dataset.rowId ?? null)
        : null;
    const row =
      id === null ? undefined : this.#rows().find((candidate) => String(candidate.id) === id);
    if (row) this.#menuRow = row;
    else event.stopPropagation();
  };

  /** Runs the row's action button: play, pause or resume. */
  public readonly runAction = (row: TrackTableRow): void => {
    const { player: playback, actions } = this.#app;
    const { action } = TrackRowStates.of(row, playback.activeTrackId, playback.status);
    if (action.kind === "play") this.#play(row.id);
    else if (action.kind === "pause") actions.run(() => playback.pause());
    else actions.run(() => playback.resume());
  };

  /** Shows a track's file in Explorer. The Properties sheet uses it too. */
  public readonly revealTrack = (trackId: TrackId): void => {
    const { actions, library } = this.#app;
    actions.run(() => library.reveal(trackId));
  };

  /** Copies a track's file path to the clipboard; a refused copy is reported. */
  public readonly copyPath = (path: string): void => {
    this.#app.actions.run(() => navigator.clipboard.writeText(path));
  };

  /** Shows the menu row's file in Explorer. */
  public readonly reveal = (): void => {
    const row = this.#menuRow;
    if (row === null) return;
    this.revealTrack(row.id);
  };

  /** Queues the menu row to play next. */
  public readonly playNext = (): void => {
    this.#enqueue(true);
  };

  /** Queues the menu row at the end of the queue. */
  public readonly addToQueue = (): void => {
    this.#enqueue(false);
  };

  /** Opens an album or artist link. The links come from `Tracks.links`, built with resolve(). */
  public readonly navigate = (href: string): void => {
    this.#app.actions.run(() => goto(href));
  };

  #enqueue(next: boolean): void {
    const row = this.#menuRow;
    if (row === null) return;
    const { actions, player: playback } = this.#app;
    actions.run(() => playback.playerEnqueueTrack(row.id, next));
  }

  #activate(trackId: TrackId): void {
    const row = this.#rows().find((candidate) => candidate.id === trackId);
    if (row === undefined) return;
    const { player: playback, actions } = this.#app;
    const { clickIntent } = TrackRowStates.of(row, playback.activeTrackId, playback.status);
    if (clickIntent === "play") this.#play(row.id);
    else if (clickIntent === "resume") actions.run(() => playback.resume());
  }
}
