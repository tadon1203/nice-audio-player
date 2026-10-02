<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { artworkUrl, type ArtworkLevel, type ArtworkRef } from "$lib/native";
  import { cn } from "$lib/utils/cn.js";

  let {
    artwork,
    alt = "",
    level = "thumb",
    loading = "lazy",
    round = false,
    class: className,
    ...restProps
  }: Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
    artwork: ArtworkRef | null | undefined;
    alt?: string;
    /** `full` only where the Sleeve is the star (Now Playing, a detail header). */
    level?: ArtworkLevel;
    loading?: "eager" | "lazy";
    round?: boolean;
    class?: string;
  } = $props();

  const url = $derived(artworkUrl(artwork, level));
  let failedUrl = $state<string | null>(null);
  const showImage = $derived(url !== null && failedUrl !== url);
</script>

<!-- The Sleeve: a square of artwork, or a quiet block when there is none. -->
<span
  {...restProps}
  data-slot="artwork"
  class={cn(
    "block aspect-square overflow-hidden bg-muted",
    round ? "rounded-full" : "rounded-lg",
    className,
  )}
>
  {#if showImage}
    <img
      src={url}
      {alt}
      {loading}
      decoding="async"
      width="512"
      height="512"
      class="size-full object-cover"
      onerror={() => (failedUrl = url)}
    />
  {:else}
    <span aria-hidden="true" class="block size-full bg-muted"></span>
  {/if}
</span>
