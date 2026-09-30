<script lang="ts">
  import { artworkUrl, type ArtworkRef } from "$lib/native";
  import { cn } from "$lib/utils/cn.js";

  let {
    artwork,
    alt = "",
    loading = "lazy",
    round = false,
    class: className,
  }: {
    artwork: ArtworkRef | null | undefined;
    alt?: string;
    loading?: "eager" | "lazy";
    round?: boolean;
    class?: string;
  } = $props();

  const url = $derived(artworkUrl(artwork));
  let failedUrl = $state<string | null>(null);
  const showImage = $derived(url !== null && failedUrl !== url);
</script>

<!-- The Sleeve: a square of artwork, or a quiet block when there is none. -->
<span
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
      class="size-full object-cover"
      onerror={() => (failedUrl = url)}
    />
  {:else}
    <span aria-hidden="true" class="block size-full bg-muted"></span>
  {/if}
</span>
