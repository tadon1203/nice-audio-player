<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "$lib/ui/shadcn/button";
  import { cn } from "$lib/utils/cn.js";

  /** On/off is the icon plus a dot beneath it, never color alone. */
  let {
    label,
    pressed,
    disabled = false,
    onclick,
    children,
  }: {
    label: string;
    pressed: boolean;
    disabled?: boolean;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<Button
  density="largeIcon"
  purpose="toggle"
  aria-label={label}
  aria-pressed={pressed}
  title={label}
  {disabled}
  {onclick}
>
  {@render children()}
  <span
    aria-hidden="true"
    data-slot="toggle-dot"
    class={cn(
      "absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current",
      !pressed && "invisible",
    )}
  ></span>
</Button>
