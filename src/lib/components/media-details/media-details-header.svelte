<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ArtworkRef } from "$lib/native";
  import { getSettings } from "$lib/settings/context";
  import Artwork from "$lib/ui/artwork.svelte";
  import ArtworkLight from "$lib/ui/artwork-light/artwork-light.svelte";
  import PageTitle from "$lib/ui/page-title.svelte";

  let {
    title,
    artist,
    artwork,
    round = false,
    children,
  }: {
    title: string;
    artist?: string;
    artwork: ArtworkRef | null;
    round?: boolean;
    children?: Snippet;
  } = $props();

  const settings = getSettings();
</script>

<!-- The header band of a detail view: artwork, title and facts over the artwork's Light. -->
<div class="@container relative -mx-6 mt-8 px-6 pt-6 pb-6 lg:-mx-10 lg:px-10">
  {#if settings.artworkBackdrop}
    <ArtworkLight
      {artwork}
      strength="medium"
      class="-top-8 -bottom-16 mask-[radial-gradient(ellipse_85%_68%_at_9rem_32%,black_15%,transparent)]"
    />
  {/if}
  <header
    class="relative grid grid-cols-1 items-start gap-8 @md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] @md:items-end"
  >
    <Artwork {artwork} alt="{title} artwork" {round} loading="eager" class="w-full max-w-56" />
    <div class="min-w-0">
      <PageTitle>{title}</PageTitle>
      {#if artist}
        <p class="mt-2 text-base text-muted-foreground">{artist}</p>
      {/if}
      {@render children?.()}
    </div>
  </header>
</div>
