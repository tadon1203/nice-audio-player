<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import type { Attachment } from "svelte/attachments";
  import { SvelteMotion } from "#lib/ui/motion/svelte-motion";
  import { SpringCurve } from "#lib/ui/motion/spring-curve";
  import { NumberTween } from "#lib/ui/motion/number-tween";
  import { WipeMask } from "./wipe-mask";
  import { cn } from "#lib/utils/cn.js";

  /**
   * Text that wipes in from left to right while it slides 8px from the side the track came from
   * (`direction` 1 = from the right). Shown only for track changes, never on first display; key
   * it by what it shows so a new value plays again.
   *
   * Only the real text is drawn, so it stays selectable and readable by assistive technology, and
   * wrapping, kerning and line breaks are the same from the first frame to the last: the
   * animation is a mask and a transform, and never changes the layout. Under reduced motion it
   * is a plain crossfade.
   */
  let {
    text,
    direction,
    class: className,
  }: {
    text: string;
    direction: 1 | -1;
    class?: string;
  } = $props();

  const { duration, easing } = SvelteMotion.of("move");
  const options = { duration, easing: SpringCurve.linear };
  const reduced = prefersReducedMotion.current;

  // Plays once per mount. The wipe ends past the text, so once it is done the mask clips nothing
  // (and is removed).
  const play: Attachment<HTMLElement> = (node) => {
    if (reduced) {
      const fade = node.animate({ opacity: [0, 1] }, { ...options, fill: "both" });
      return () => fade.cancel();
    }
    const slide = node.animate(
      { transform: [`translateX(${8 * direction}px)`, "translateX(0)"] },
      { ...options, fill: "backwards" },
    );
    const wipe = new NumberTween(0, WipeMask.REVEAL_END_PERCENT, {
      duration,
      easing,
      onUpdate: (percent): void => {
        const mask = WipeMask.at(percent);
        node.style.maskImage = mask;
        node.style.webkitMaskImage = mask;
      },
      onComplete: (): void => {
        node.style.maskImage = "";
        node.style.webkitMaskImage = "";
      },
    });
    return () => {
      slide.cancel();
      wipe.stop();
    };
  };
</script>

<!-- Hidden at first so the frame before the animation starts does not flash the full text. -->
<span
  {@attach play}
  class={cn("block", className)}
  style:opacity={reduced ? 0 : undefined}
  style:mask-image={reduced ? undefined : WipeMask.at(0)}
  style:-webkit-mask-image={reduced ? undefined : WipeMask.at(0)}>{text}</span
>
