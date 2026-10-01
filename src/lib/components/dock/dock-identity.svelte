<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { goto } from "$app/navigation";
  import { albumArtistHref, albumHref } from "$lib/library/routes";
  import { getPlayback } from "$lib/playback/context";
  import { nowPlaying } from "$lib/shell/now-playing.svelte";
  import Artwork from "$lib/ui/artwork.svelte";
  import ContextMenuContent from "$lib/ui/context-menu/context-menu-content.svelte";
  import ContextMenuItem from "$lib/ui/context-menu/context-menu-item.svelte";
  import { SLEEVE_RADIUS, sharedElement, sharedKey } from "$lib/ui/motion/shared-element";
  import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
  import { slideTransition } from "$lib/ui/motion/svelte-slide";
  import { Button } from "$lib/ui/shadcn/button";
  import * as Tooltip from "$lib/ui/shadcn/tooltip";

  /** Sliding distance for the artwork, title and artist. One value so they travel together. */
  const SLIDE_PX = 16;

  const playback = getPlayback();
  const budget = getMotionBudget();
  const item = $derived(playback.item);
  const trackKey = $derived(item?.file.path ?? "none");
  const title = $derived(item?.title ?? "Nothing playing");
  const nowPlayingOpen = $derived(nowPlaying.isOpen);
  const hasTrack = $derived(item !== null);
  const albumKey = $derived(item?.albumKey ?? null);
  const artistName = $derived(
    albumKey?.albumArtist || item?.albumArtist?.trim() || item?.artist?.trim() || "",
  );

  /**
   * Next enters from the right and pushes the old track out to the left; previous mirrors it.
   * Under reduced motion it is a plain crossfade.
   */
  function slide(_node: Element, { entering }: { entering: boolean }) {
    const direction = playback.lastNavigation === "previous" ? -1 : 1;
    return slideTransition("move", budget.current === "reduced", {
      x: (entering ? direction : -direction) * SLIDE_PX,
    });
  }

  // Plain strings from routes.ts, not resolve(): see there.
  function goToAlbum() {
    if (albumKey === null) return;
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(albumHref(albumKey.albumArtist, albumKey.title));
  }

  function goToArtist() {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(albumArtistHref(artistName));
  }

  let errorTooltipOpen = $state(false);
</script>

<div class="col-start-1 flex min-w-0 items-center gap-3" data-region="playback-identity">
  <!-- Now Playing has its own big Sleeve (the shared-element target). While it is open this slot
  holds the close affordance instead, so the dock's layout does not shift. -->
  {#if nowPlayingOpen}
    <Button
      variant="ghost"
      aria-label="Close Now Playing"
      onclick={() => nowPlaying.close()}
      data-slot="sleeve-close"
      class="size-16 shrink-0"
    >
      <ChevronDown aria-hidden="true" class="size-6" />
    </Button>
  {:else}
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger>
        {#snippet child({ props })}
          <!-- Inset, not edge-filling: a rounded tile that sits inside the identity column like
          any other artwork placed in the workspace. -->
          <button
            {...props}
            type="button"
            aria-label="Open Now Playing"
            disabled={!hasTrack}
            onclick={() => nowPlaying.open()}
            data-slot="sleeve"
            class="grid aspect-square size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          >
            <!-- The shared element: this Sleeve flies to Now Playing on open and back on close.
            The radius is set inline (not by class) so the flight's scale does not stretch the
            corners. -->
            <span
              {@attach sharedElement(sharedKey.sleeve)}
              class="grid size-full overflow-hidden"
              style:border-radius={SLEEVE_RADIUS}
            >
              {#key trackKey}
                <span
                  class="size-full [grid-area:1/1]"
                  in:slide={{ entering: true }}
                  out:slide={{ entering: false }}
                >
                  <Artwork
                    artwork={item?.artwork ?? null}
                    alt={item === null ? "" : `${item.title} artwork`}
                    loading="eager"
                    class="size-full rounded-lg"
                  />
                </span>
              {/key}
            </span>
          </button>
        {/snippet}
      </ContextMenuPrimitive.Trigger>
      {#if hasTrack}
        <ContextMenuContent side="right" align="start" class="min-w-40">
          {#if albumKey !== null}
            <ContextMenuItem onSelect={goToAlbum}>Go to album</ContextMenuItem>
          {/if}
          {#if artistName !== ""}
            <ContextMenuItem onSelect={goToArtist}>Go to artist</ContextMenuItem>
          {/if}
        </ContextMenuContent>
      {/if}
    </ContextMenuPrimitive.Root>
    <div class="grid min-w-0">
      <!-- Title and artist are one keyed block, so they leave and arrive as one piece. -->
      {#key trackKey}
        <div
          class="flex min-w-0 flex-col justify-center gap-0.5 [grid-area:1/1]"
          in:slide={{ entering: true }}
          out:slide={{ entering: false }}
        >
          <button
            type="button"
            disabled={item === null}
            onclick={() => nowPlaying.toggle()}
            {title}
            class="block max-w-full cursor-pointer truncate rounded-sm text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          >
            {title}
          </button>
          {#if playback.transport.commandError}
            <div class="flex min-w-0 items-center gap-2">
              <Tooltip.Root bind:open={errorTooltipOpen}>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                    <span
                      {...props}
                      class="block truncate text-sm text-destructive"
                      role="alert"
                      tabindex="0"
                      onfocus={() => (errorTooltipOpen = true)}
                      onblur={() => (errorTooltipOpen = false)}
                    >
                      {playback.transport.commandError}
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>{playback.transport.commandError}</Tooltip.Content>
              </Tooltip.Root>
              <button
                type="button"
                onclick={() => playback.clearError()}
                class="shrink-0 cursor-pointer rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                Dismiss
              </button>
            </div>
          {:else if item?.artist}
            <span class="block truncate text-sm text-muted-foreground" title={item.artist}>
              {item.artist}
            </span>
          {/if}
        </div>
      {/key}
    </div>
  {/if}
</div>
