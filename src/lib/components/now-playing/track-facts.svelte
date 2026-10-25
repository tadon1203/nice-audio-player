<script lang="ts">
  import { Button } from "#lib/ui/shadcn/button";
  import { type Lyrics, type PlaybackItem } from "#lib/native/bindings";
  import { SignalPath } from "#lib/components/signal-path/signal-path.svelte";
  import FactLine from "#lib/ui/fact-line.svelte";
  import { Tracks } from "#lib/library/tracks";
  import { TrackFacts } from "./track-facts";
  import { NowPlayingActions } from "./now-playing-actions.svelte";

  /**
   * Artist and album, each a link to its page (following one closes Now Playing: page state is
   * not carried across navigation), then `2019  Disc 2  Track 4  FLAC 24/96  No lyrics`: what the
   * library knows, what is really decoded, and the lyrics' state.
   */
  let {
    item,
    lyrics,
  }: {
    item: PlaybackItem | null;
    lyrics: Lyrics | null;
  } = $props();

  const linkClass =
    "rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";

  const signalPath = new SignalPath();
  const links = $derived(item === null ? null : Tracks.links(item));
  const artistHref = $derived(links?.artist?.href ?? null);
  const albumLinkHref = $derived(links?.album?.href ?? null);
  const state = $derived(item === null ? null : TrackFacts.lyricsState(lyrics));
  const actions = new NowPlayingActions();
</script>

{#if item !== null && links !== null}
  {#if links.artist !== null}
    <p class="truncate text-base text-foreground">
      {#if artistHref !== null}
        <a href={artistHref} class={linkClass}>{links.artist.text}</a>
      {:else}
        {links.artist.text}
      {/if}
    </p>
  {/if}
  {#if links.album !== null}
    <p class="truncate text-sm text-foreground [@container(max-height:520px)]:hidden">
      {#if albumLinkHref !== null}
        <a href={albumLinkHref} class={linkClass}>{links.album.text}</a>
      {:else}
        {links.album.text}
      {/if}
    </p>
  {/if}
  <div class="mt-1 flex flex-wrap items-baseline gap-x-4 text-sm text-muted-foreground">
    <FactLine facts={TrackFacts.of(item, signalPath.current?.source)} />
    {#if state?.kind === "notFound"}
      <span>No lyrics</span>
    {:else if state?.kind === "sourceFailed"}
      <Button
        type="button"
        title="{state.fileName} (click to copy)"
        onclick={() => actions.copy(state.fileName)}
        variant="text"
        size="inline"
        class="font-normal"
      >
        Lyrics file unreadable
      </Button>
    {:else if state?.kind === "embedded"}
      <span title="The .lrc file couldn't be read.">Embedded lyrics</span>
    {:else if state?.kind === "unsynced"}
      <span>Unsynced lyrics</span>
    {/if}
  </div>
{/if}
