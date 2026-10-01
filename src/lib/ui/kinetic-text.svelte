<script lang="ts">
  import { animate } from "motion";
  import { prefersReducedMotion } from "svelte/motion";
  import type { Attachment } from "svelte/attachments";
  import { toMotionOptions } from "$lib/ui/motion/motion-options";
  import { motionTokens } from "$lib/ui/motion/tokens";
  import { REVEAL_END_PERCENT, wipeMask } from "$lib/ui/wipe-mask";
  import { cn } from "$lib/utils/cn.js";

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

  const options = toMotionOptions(motionTokens.mediumMove);
  const reduced = prefersReducedMotion.current;

  // Plays once per mount. The wipe ends past the text, so once it is done the mask clips nothing
  // (and is removed).
  const play: Attachment<HTMLElement> = (node) => {
    if (reduced) {
      const fade = animate(node, { opacity: [0, 1] }, options);
      return () => fade.stop();
    }
    const slide = animate(node, { x: [8 * direction, 0] }, options);
    const wipe = animate(0, REVEAL_END_PERCENT, {
      ...options,
      onUpdate: (percent) => {
        const mask = wipeMask(percent);
        node.style.maskImage = mask;
        node.style.webkitMaskImage = mask;
      },
      onComplete: () => {
        node.style.maskImage = "";
        node.style.webkitMaskImage = "";
      },
    });
    return () => {
      slide.stop();
      wipe.stop();
    };
  };
</script>

<!-- Hidden at first so the frame before the animation starts does not flash the full text. -->
<span
  {@attach play}
  class={cn("block", className)}
  style:opacity={reduced ? 0 : undefined}
  style:mask-image={reduced ? undefined : wipeMask(0)}
  style:-webkit-mask-image={reduced ? undefined : wipeMask(0)}>{text}</span
>
