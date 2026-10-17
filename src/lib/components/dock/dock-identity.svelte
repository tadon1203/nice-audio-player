<script lang="ts">
  import { Root as ContextMenuRoot, Trigger as ContextMenuTrigger } from "#lib/ui/context-menu";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { goto } from "$app/navigation";
  import { Tracks } from "#lib/library/tracks";
  import { PlaybackFailure } from "#lib/playback/playback-failure";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import { ErrorMessages } from "#lib/shell/error-messages";
  import Artwork from "#lib/ui/artwork.svelte";
  import ContextMenuContent from "#lib/ui/context-menu/context-menu-content.svelte";
  import ContextMenuItem from "#lib/ui/context-menu/context-menu-item.svelte";
  import { SLEEVE_RADIUS, sharedElement, sharedKey } from "#lib/ui/motion/shared-element";
  import { slideTransition } from "#lib/ui/motion/svelte-slide";
  import { Button } from "#lib/ui/shadcn/button";
  import * as Tooltip from "#lib/ui/shadcn/tooltip";

  /** Sliding distance for the artwork, title and artist. One value so they travel together. */
  const SLIDE_PX = 16;

  const { playback, session, motion: budget, notices, actions, nowPlaying } = AppServices.current();
  // A failed startup shows its reason here, since there is no playback state to report on.
  const notice = $derived(
    session.connection === "failed"
      ? { kind: "error" as const, message: ErrorMessages.of(session.startupError) }
      : notices.at("dock"),
  );
  const item = $derived(playback.item);
  const trackKey = $derived(item?.trackId ?? "none");
  const title = $derived(item?.title ?? "Nothing playing");
  const nowPlayingOpen = $derived(nowPlaying.isOpen);
  const hasTrack = $derived(item !== null);
  const links = $derived(item === null ? null : Tracks.links(item));

  /**
   * Next enters from the right and pushes the old track out to the left; previous mirrors it.
   * Under reduced motion it is a plain crossfade.
   */
  function slide(_node: Element, { entering }: { entering: boolean }) {
    const direction = playback.transitionDirection === "backward" ? -1 : 1;
    return slideTransition("move", budget.current === "reduced", {
      x: (entering ? direction : -direction) * SLIDE_PX,
    });
  }

  // The links come from `Tracks.links`, which builds them with resolve().
  function goTo(href: string) {
    void goto(href);
  }

  let errorTooltipOpen = $state(false);
</script>

<div class="col-start-1 flex min-w-0 items-center gap-3" data-region="playback-identity">
  <!-- Now Playing has its own big Sleeve (the shared-element target). While it is open this slot
  holds the close affordance instead, so the dock's layout does not shift. -->
  {#if nowPlayingOpen}
    <Button
      variant="quiet"
      aria-label="Close Now Playing"
      onclick={() => nowPlaying.close()}
      data-slot="sleeve-close"
      size="inline"
      class="size-16 rounded-lg p-0"
    >
      <ChevronDown aria-hidden="true" class="size-6" />
    </Button>
  {:else}
    <ContextMenuRoot>
      <ContextMenuTrigger>
        {#snippet child({ props })}
          <!-- Inset, not edge-filling: a rounded tile that sits inside the identity column like
          any other artwork placed in the workspace. -->
          <Button
            {...props}
            type="button"
            aria-label="Open Now Playing"
            disabled={!hasTrack}
            onclick={() => nowPlaying.open()}
            data-slot="sleeve"
            variant="bare"
            size="inline"
            class="grid aspect-square overflow-hidden rounded-lg size-16 p-0"
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
          </Button>
        {/snippet}
      </ContextMenuTrigger>
      {#if hasTrack}
        <ContextMenuContent side="right" align="start" width="compact">
          {#if links?.album?.href}
            {@const href = links.album.href}
            <ContextMenuItem onSelect={() => goTo(href)}>Go to album</ContextMenuItem>
          {/if}
          {#if links?.artist?.href}
            {@const href = links.artist.href}
            <ContextMenuItem onSelect={() => goTo(href)}>Go to artist</ContextMenuItem>
          {/if}
        </ContextMenuContent>
      {/if}
    </ContextMenuRoot>
    <div class="grid min-w-0">
      <!-- Title and artist are one keyed block, so they leave and arrive as one piece. -->
      {#key trackKey}
        <div
          class="flex min-w-0 flex-col justify-center gap-0.5 [grid-area:1/1]"
          in:slide={{ entering: true }}
          out:slide={{ entering: false }}
        >
          <Button
            type="button"
            disabled={item === null}
            onclick={() => nowPlaying.toggle()}
            {title}
            variant="bare"
            size="inline"
            class="block max-w-full truncate text-left text-foreground"
          >
            {title}
          </Button>
          {#if notice?.kind === "error"}
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
                      {notice.message}
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>{notice.message}</Tooltip.Content>
              </Tooltip.Root>
              <Button
                type="button"
                onclick={() => notices.dismiss("dock", "error")}
                variant="text"
                size="inline"
                class="font-normal"
              >
                Dismiss
              </Button>
            </div>
          {:else if playback.failure !== null}
            {@const reason = PlaybackFailure.message(playback.failure)}
            <div class="flex min-w-0 items-center gap-2">
              <span class="block truncate text-sm text-destructive" role="alert" title={reason}>
                {reason}
              </span>
              <Button
                type="button"
                onclick={() => actions.run(() => playback.resume())}
                variant="text"
                size="inline"
                class="font-normal"
              >
                Retry
              </Button>
            </div>
          {:else if notice?.kind === "undo"}
            <div class="flex min-w-0 items-center gap-2">
              <span class="block truncate text-sm text-muted-foreground" role="status">
                {notice.message}
              </span>
              <span aria-hidden="true" class="shrink-0 text-sm text-muted-foreground">·</span>
              <Button
                type="button"
                onclick={() => actions.run(() => playback.undoQueueChange())}
                variant="text"
                size="inline"
                class="font-normal"
              >
                Undo
              </Button>
            </div>
          {:else if notice?.kind === "skipped"}
            <div class="flex min-w-0 items-center gap-2">
              <span class="block truncate text-sm text-muted-foreground" role="status">
                {notice.message}
              </span>
              <Button
                type="button"
                onclick={() => notices.dismiss("dock", "skipped")}
                variant="text"
                size="inline"
                class="font-normal"
              >
                Dismiss
              </Button>
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
