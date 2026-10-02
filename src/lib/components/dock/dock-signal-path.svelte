<script lang="ts">
  import { DropdownMenu as MenuPrimitive } from "bits-ui";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { createPlaybackSignalPath } from "$lib/components/signal-path/signal-path.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { createAudioOutputDevices } from "$lib/playback/output-devices.svelte";
  import DropdownMenuContent from "$lib/ui/dropdown-menu/dropdown-menu-content.svelte";
  import DropdownMenuRadioItem from "$lib/ui/dropdown-menu/dropdown-menu-radio-item.svelte";
  import FlapText from "$lib/ui/rolling-number/flap-text.svelte";
  import { cn } from "$lib/utils/cn.js";

  const DEFAULT_DEVICE = "default";

  /**
   * `source › processing › output ▾`, with the output-device menu on the last step.
   * Without resampling it reads `FLAC 24/96 › Speakers`.
   */
  let { class: className }: { class?: string } = $props();

  const playback = getPlayback();
  const path = createPlaybackSignalPath();
  let open = $state(false);
  const devices = createAudioOutputDevices(() => open);

  const disabled = $derived(playback.connection !== "ready");
  const selected = $derived(playback.outputDeviceId ?? DEFAULT_DEVICE);
  const outputLabel = $derived(
    path.current?.output ?? (playback.outputDeviceId !== null ? "Output" : "System default"),
  );
  const steps = $derived(
    path.current === null
      ? []
      : [path.current.source, path.current.processing].filter((step) => step !== null),
  );

  function select(value: string) {
    void playback.setOutputSelection(
      value === DEFAULT_DEVICE ? { kind: "systemDefault" } : { kind: "device", deviceId: value },
    );
  }
</script>

<div
  class={cn(
    "flex h-5 max-w-full min-w-0 items-center gap-1.5 text-sm text-muted-foreground",
    className,
  )}
  role="group"
  aria-label="Signal path"
  data-region="signal-path"
>
  {#each steps as step, index (index)}
    <span class="flex shrink-0 items-center gap-1.5 tabular-nums">
      <FlapText value={step} />
      <span aria-hidden="true">›</span>
    </span>
  {/each}
  <MenuPrimitive.Root bind:open>
    <MenuPrimitive.Trigger
      {disabled}
      aria-label="Output device: {outputLabel}"
      class="flex min-w-0 cursor-pointer items-center gap-0.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
    >
      <span class="truncate">{outputLabel}</span>
      <ChevronDown aria-hidden="true" class="size-3.5 shrink-0" />
    </MenuPrimitive.Trigger>
    <DropdownMenuContent align="end">
      <MenuPrimitive.RadioGroup value={selected} onValueChange={select}>
        <DropdownMenuRadioItem value={DEFAULT_DEVICE}>System default</DropdownMenuRadioItem>
        {#each devices.data ?? [] as device (device.id)}
          <DropdownMenuRadioItem value={device.id}>{device.name}</DropdownMenuRadioItem>
        {/each}
      </MenuPrimitive.RadioGroup>
    </DropdownMenuContent>
  </MenuPrimitive.Root>
</div>
