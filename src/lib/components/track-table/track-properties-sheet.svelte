<script lang="ts">
  import { type TrackId } from "#lib/native/bindings";
  import { errorMessage } from "#lib/native/messages";
  import { QueryResult } from "#lib/library/query-result.svelte";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import { Button } from "#lib/ui/shadcn/button/index.js";
  import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
  } from "#lib/ui/shadcn/sheet";
  import { AudioFormatText } from "#lib/utils/audio-format-text";
  import { CountFormat } from "#lib/utils/count-format";
  import { DurationFormat } from "#lib/utils/duration-format";
  import { MISSING } from "#lib/utils/missing";

  /** Everything the library knows about one track: tags, audio format, and where the file is. */
  let {
    trackId,
    onclose,
    onreveal,
    oncopy,
  }: {
    trackId: TrackId | null;
    onclose: () => void;
    /** Shows the track's file in Explorer. */
    onreveal: (trackId: TrackId) => void;
    /** Copies the track's file path to the clipboard. */
    oncopy: (path: string) => void;
  } = $props();

  const { catalog } = AppServices.current();
  const query = new QueryResult(() => catalog.trackPropertiesOptions(trackId));
  const properties = $derived(query.data);

  const orNull = <T,>(value: T | null, format: (value: T) => string): string | null =>
    value === null ? null : format(value);
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
    <div class="border-b border-border">
      <SheetHeader>
        <SheetTitle>Properties</SheetTitle>
        <SheetDescription class="truncate">
          {properties?.title ?? properties?.fileName ?? " "}
        </SheetDescription>
      </SheetHeader>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      {#if properties}
        {@const path = properties.path}
        <dl class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          {@render row("Title", properties.title)}
          {@render row("Artist", properties.artist)}
          {@render row("Album", properties.album)}
          {@render row("Album artist", properties.albumArtist)}
          {@render row("Track", CountFormat.ofTotal(properties.trackNumber, properties.trackTotal))}
          {@render row("Disc", CountFormat.ofTotal(properties.discNumber, properties.discTotal))}
          {@render row("Genre", properties.genre)}
          {@render row("Date", properties.date)}
          {@render row("Duration", orNull(properties.durationMs, DurationFormat.of))}
          {@render row(
            "Format",
            AudioFormatText.path({
              format: properties.fileFormat,
              bitDepth: properties.bitDepth,
              sampleRate: properties.sampleRate,
              bitrateKbps: properties.bitrateKbps,
            }),
          )}
          {@render row("Codec", properties.codec)}
          {@render row("Sample rate", orNull(properties.sampleRate, AudioFormatText.sampleRate))}
          {@render row("Channels", properties.channelCount)}
          {@render row(
            "Bit depth",
            orNull(properties.bitDepth, (bits) => `${bits}-bit`),
          )}
          {@render row(
            "Bit rate",
            orNull(properties.bitrateKbps, (kbps) => `${kbps} kbps`),
          )}
          <dt class="text-muted-foreground">File</dt>
          <dd class="min-w-0 tabular-nums">
            <span class="break-all">{properties.path}</span>
            <span class="mt-2 flex gap-2">
              <Button type="button" variant="quiet" size="compact" onclick={() => oncopy(path)}>
                Copy path
              </Button>
              <Button
                type="button"
                variant="quiet"
                size="compact"
                onclick={() => onreveal(properties.id)}
              >
                Show in Explorer
              </Button>
            </span>
          </dd>
        </dl>
      {:else if query.error}
        <p class="text-sm text-muted-foreground">{errorMessage(query.error)}</p>
      {/if}
    </div>
  </SheetContent>
</Sheet>
