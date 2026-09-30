<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { libraryQueryOptions } from "$lib/library/queries";
  import { requireNative } from "$lib/native";
  import { Button } from "$lib/ui/shadcn/button/index.js";
  import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
  } from "$lib/ui/shadcn/sheet";
  import { formatAudioPath, formatDuration, formatSampleRate, MISSING } from "$lib/utils/format";
  import { ofTotal } from "./track-columns";

  /** Everything the library knows about one track: tags, audio format, and where the file is. */
  let { trackId, onclose }: { trackId: string | null; onclose: () => void } = $props();

  const query = createQuery(() => libraryQueryOptions.trackProperties(trackId));
  const properties = $derived(query.data);
</script>

{#snippet row(label: string, value: string | number | null | undefined)}
  <dt class="text-muted-foreground">{label}</dt>
  <dd class="min-w-0 tabular-nums">
    {#if value === null || value === undefined || value === ""}
      <span class="text-muted-foreground">{MISSING}</span>
    {:else}
      {value}
    {/if}
  </dd>
{/snippet}

<Sheet
  open={trackId !== null}
  onOpenChange={(open) => {
    if (!open) onclose();
  }}
>
  <SheetContent side="right" class="w-96 gap-0 p-0">
    <SheetHeader class="border-b border-border pb-4">
      <SheetTitle>Properties</SheetTitle>
      <SheetDescription class="truncate">
        {properties?.title ?? properties?.fileName ?? " "}
      </SheetDescription>
    </SheetHeader>
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      {#if properties}
        <dl class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          {@render row("Title", properties.title)}
          {@render row("Artist", properties.artist)}
          {@render row("Album", properties.album)}
          {@render row("Album artist", properties.albumArtist)}
          {@render row("Track", ofTotal(properties.trackNumber, properties.trackTotal))}
          {@render row("Disc", ofTotal(properties.discNumber, properties.discTotal))}
          {@render row("Genre", properties.genre)}
          {@render row("Date", properties.date)}
          {@render row(
            "Duration",
            properties.durationMs === null ? null : formatDuration(properties.durationMs),
          )}
          {@render row(
            "Format",
            formatAudioPath({
              format: properties.fileFormat,
              bitDepth: properties.bitDepth,
              sampleRate: properties.sampleRate,
              bitrateKbps: properties.bitrateKbps,
            }),
          )}
          {@render row("Codec", properties.codec)}
          {@render row(
            "Sample rate",
            properties.sampleRate === null ? null : formatSampleRate(properties.sampleRate),
          )}
          {@render row("Channels", properties.channelCount)}
          {@render row(
            "Bit depth",
            properties.bitDepth === null ? null : `${properties.bitDepth}-bit`,
          )}
          {@render row(
            "Bit rate",
            properties.bitrateKbps === null ? null : `${properties.bitrateKbps} kbps`,
          )}
          <dt class="text-muted-foreground">File</dt>
          <dd class="min-w-0 tabular-nums">
            <span class="break-all">{properties.path}</span>
            <span class="mt-2 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => void navigator.clipboard?.writeText(properties.path)}
              >
                Copy path
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => void requireNative().revealLibraryTrack(properties.id)}
              >
                Show in Explorer
              </Button>
            </span>
          </dd>
        </dl>
      {:else if !query.isPending}
        <p class="text-sm text-muted-foreground">This track is no longer in the library.</p>
      {/if}
    </div>
  </SheetContent>
</Sheet>
