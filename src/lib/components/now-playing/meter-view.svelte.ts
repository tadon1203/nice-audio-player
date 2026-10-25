import type { Attachment } from "svelte/attachments";
import { meter } from "#lib/native/commands";
import { BALLISTICS, BAND_COUNT } from "#lib/meters/ballistics";
import { DrawLoop } from "#lib/meters/draw-loop";
import { MeterDisplay } from "#lib/meters/meter-display";
import { MeterFeed } from "#lib/meters/meter-feed.svelte";
import { reduceMeterFrames } from "#lib/meters/meter-frames";
import { MeterDraw } from "#lib/meters/meter-draw";
import { Readout } from "#lib/meters/readout";
import { AppServices } from "#lib/shell/app-services.svelte";
import { DocumentVisibility } from "#lib/ui/document-visibility.svelte";

const NARROW_BELOW_PX = 512;
const READOUT_MS = 250;

export type MeterSurface = "spectrum" | "left" | "right";
export type MeterLayout = "wide" | "narrow";

interface Surface {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  node: HTMLCanvasElement;
}

/**
 * The Meters view's state and drawing: the Spectrum and the Level meters on their canvases, the
 * held-peak readouts and the clip flags. It runs only while motion is allowed and the window is
 * visible: one draw loop, and the Meter feed subscribed for exactly that long. Construct it while
 * a component initialises.
 */
export class MeterView {
  /** The axis labels of the Spectrum: the band's centre, as a percentage across the canvas. */
  public static readonly bandLabels = Object.entries({
    1: "31",
    4: "63",
    7: "125",
    10: "250",
    13: "500",
    16: "1k",
    19: "2k",
    22: "4k",
    25: "8k",
    28: "16k",
  }).map(([index, text]) => ({
    text,
    left: ((Number(index) + 0.5) / BAND_COUNT) * 100,
  }));

  readonly #services = AppServices.current();
  readonly #visibility = new DocumentVisibility();
  readonly #active = $derived(!this.calm && this.#visibility.visible);
  readonly #feed: MeterFeed;
  readonly #surfaces: Record<MeterSurface, Surface | null> = {
    spectrum: null,
    left: null,
    right: null,
  };
  readonly #floorText = Readout.formatHeldPeak(BALLISTICS.floorDb);
  #layout = $state<MeterLayout>("wide");
  #readouts = $state<[string, string]>([this.#floorText, this.#floorText]);
  #clips = $state<[boolean, boolean]>([false, false]);
  #display = MeterDisplay.initial();
  #color = "";
  #wake: () => void = () => {};

  public constructor() {
    this.#feed = new MeterFeed(
      meter,
      () => this.#active,
      () => this.#wake(),
    );

    // The draw loop and the readout timer run only while the view is active. Timers and
    // animation frames are external sources that this effect starts and stops.
    $effect(() => {
      if (!this.#active) return;
      this.#display = MeterDisplay.initial();
      this.#refreshReadouts();
      const probe = this.#surfaces.spectrum?.node ?? null;
      this.#color = probe ? getComputedStyle(probe).color : this.#color;
      // The loop sleeps once every Level bar and Peak cap is at the floor and wakes on the next frame.
      const loop = new DrawLoop(
        (elapsed) => {
          const { playback } = this.#services;
          const input =
            playback.status === "playing"
              ? reduceMeterFrames(this.#feed.drain())
              : (this.#feed.drain(), null);
          this.#display = this.#display.step(input, elapsed);
          this.#drawAll(this.#color);
          return !this.#display.isAtRest();
        },
        {
          request: (callback): number => requestAnimationFrame(callback),
          cancel: (id): void => cancelAnimationFrame(id),
        },
      );
      this.#wake = (): void => loop.wake();
      loop.wake();
      const interval = setInterval(() => this.#refreshReadouts(), READOUT_MS);

      return (): void => {
        this.#wake = (): void => {};
        loop.stop();
        clearInterval(interval);
        this.#display = MeterDisplay.initial();
        this.#refreshReadouts();
        this.#drawAll(this.#color || (probe ? getComputedStyle(probe).color : ""));
      };
    });
  }

  public get layout(): MeterLayout {
    return this.#layout;
  }

  public get narrow(): boolean {
    return this.#layout === "narrow";
  }

  /** Calm motion is on: the meters are stopped and show the floor. */
  public get calm(): boolean {
    return this.#services.appearance.calmMotion === true;
  }

  public get floorText(): string {
    return this.#floorText;
  }

  /** The held-peak readouts of the two channels, as text. */
  public get readouts(): readonly [string, string] {
    return this.#readouts;
  }

  /** Whether each channel shows its Clip flag. */
  public get clips(): readonly [boolean, boolean] {
    return this.#clips;
  }

  /** Sizes a canvas to its box and keeps it so; the surface is drawn again after each resize. */
  public fit(surface: MeterSurface): Attachment<HTMLCanvasElement> {
    return (node) => {
      const refit = (): void => {
        const ratio = window.devicePixelRatio || 1;
        const w = node.clientWidth;
        const h = node.clientHeight;
        node.width = Math.max(1, Math.round(w * ratio));
        node.height = Math.max(1, Math.round(h * ratio));
        const ctx = node.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        this.#surfaces[surface] = { ctx, w, h, node };
        // Resizing clears the canvas: put the current state back.
        this.#drawAll(this.#color || getComputedStyle(node).color);
      };
      const observer = new ResizeObserver(refit);
      observer.observe(node);
      refit();
      return () => {
        observer.disconnect();
        this.#surfaces[surface] = null;
      };
    };
  }

  /** Chooses the narrow layout below `NARROW_BELOW_PX` of the view's own width. */
  public readonly observeLayout: Attachment<HTMLElement> = (node) => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) this.#layout = entry.contentRect.width < NARROW_BELOW_PX ? "narrow" : "wide";
    });
    observer.observe(node);
    return () => observer.disconnect();
  };

  /** Clears a channel's Clip flag. */
  public clearClip(channel: 0 | 1): void {
    this.#display = this.#display.clearClip(channel);
    this.#refreshReadouts();
  }

  #drawAll(ink: string): void {
    const { spectrum, left, right } = this.#surfaces;
    if (spectrum)
      MeterDraw.drawSpectrum(spectrum.ctx, spectrum.w, spectrum.h, ink, this.#display.bands);
    if (left)
      MeterDraw.drawLevel(
        left.ctx,
        left.w,
        left.h,
        ink,
        this.#display.peak[0],
        this.#display.rms[0],
      );
    if (right)
      MeterDraw.drawLevel(
        right.ctx,
        right.w,
        right.h,
        ink,
        this.#display.peak[1],
        this.#display.rms[1],
      );
  }

  #refreshReadouts(): void {
    this.#readouts = [
      Readout.formatHeldPeak(this.#display.peak[0].peakCap),
      Readout.formatHeldPeak(this.#display.peak[1].peakCap),
    ];
    this.#clips = [this.#display.clip[0], this.#display.clip[1]];
  }
}
