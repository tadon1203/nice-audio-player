<script lang="ts">
  import { DropdownMenu as MenuPrimitive } from "bits-ui";
  import { ChevronDown } from "@lucide/svelte";
  import { createPlaybackSignalPath } from "$lib/components/signal-path/signal-path.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { createAudioOutputDevices } from "$lib/playback/output-devices.svelte";
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

  const disabled = $derived(
    playback.transport.connection !== "ready" || playback.transport.pending !== null,
  );
  const selection = $derived(playback.output.outputSelection);
  const selected = $derived(selection.kind === "device" ? selection.deviceId : DEFAULT_DEVICE);
  const outputLabel = $derived(
    path.current?.output ?? (selection.kind === "device" ? "Output" : "System default"),
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

  const itemClass =
    "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-[state=checked]:text-foreground";
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
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="menu-content"
        align="end"
        class="acrylic data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 z-20 min-w-44 origin-(--bits-dropdown-menu-content-transform-origin) rounded-lg p-1 text-sm text-popover-foreground shadow-floating ring-1 ring-foreground/10 outline-none duration-100"
      >
        <MenuPrimitive.RadioGroup value={selected} onValueChange={select}>
          <MenuPrimitive.RadioItem value={DEFAULT_DEVICE} class={itemClass}>
            System default
          </MenuPrimitive.RadioItem>
          {#each devices.data ?? [] as device (device.id)}
            <MenuPrimitive.RadioItem value={device.id} class={itemClass}>
              {device.name}
            </MenuPrimitive.RadioItem>
          {/each}
        </MenuPrimitive.RadioGroup>
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  </MenuPrimitive.Root>
</div>
