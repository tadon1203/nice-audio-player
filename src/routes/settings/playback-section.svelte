<script lang="ts">
  import { getPlayback } from "$lib/playback/context";
  import { createAudioOutputDevices } from "$lib/playback/output-devices.svelte";
  import { createPlaybackSignalPath } from "$lib/components/signal-path/signal-path.svelte";
  import { getSettings } from "$lib/settings/context";
  import type { SettingsUpdate } from "$lib/settings/settings.svelte";
  import FlapText from "$lib/ui/rolling-number/flap-text.svelte";
  import SectionTitle from "$lib/ui/section-title.svelte";
  import * as Select from "$lib/ui/shadcn/select/index.js";
  import SettingsSwitchField from "./settings-switch-field.svelte";

  const DEFAULT_DEVICE = "default";

  const playback = getPlayback();
  const settings = getSettings();
  const signalPath = createPlaybackSignalPath();

  let deviceMenuOpen = $state(false);
  const devices = createAudioOutputDevices(() => deviceMenuOpen);

  const path = $derived(signalPath.current);
  const selected = $derived(playback.outputDeviceId ?? DEFAULT_DEVICE);
  const outputLabel = $derived(
    path?.output ?? (playback.outputDeviceId !== null ? "Output" : "System default"),
  );
  const rows = $derived([
    { label: "Source", value: path?.source ?? "—" },
    { label: "Processing", value: path?.processing ?? "None" },
  ]);

  function chooseDevice(value: string) {
    void playback.setOutputSelection(
      value === DEFAULT_DEVICE ? { kind: "systemDefault" } : { kind: "device", deviceId: value },
    );
  }

  // The store rolls a failed change back and records the error, which is shown below.
  function update(patch: SettingsUpdate) {
    void settings.update(patch);
  }
</script>

<section aria-labelledby="playback-heading" class="mt-8">
  <SectionTitle id="playback-heading">Playback</SectionTitle>
  <p class="mt-1 text-sm leading-5 text-muted-foreground">
    The current signal path and how artwork lights the app.
  </p>

  <!-- A technical ledger: each signal-path stage on the Gutter, next to its own setting. -->
  <dl class="mt-5 divide-y divide-border border-y border-border text-sm">
    {#each rows as row (row.label)}
      <div class="flex items-center gap-6 py-3">
        <dt class="w-16 shrink-0 text-muted-foreground">{row.label}</dt>
        <dd class="min-w-0 truncate tabular-nums text-foreground">
          <FlapText value={row.value} />
        </dd>
      </div>
    {/each}
    <div class="flex items-center gap-6 py-3">
      <dt class="w-16 shrink-0 text-muted-foreground">Output</dt>
      <dd class="min-w-0">
        <Select.Root
          type="single"
          bind:open={deviceMenuOpen}
          value={selected}
          onValueChange={chooseDevice}
        >
          <Select.Trigger
            disabled={playback.connection !== "ready"}
            aria-label={`Output device: ${outputLabel}`}
            appearance="inline-value"
          >
            <span class="truncate tabular-nums">{outputLabel}</span>
          </Select.Trigger>
          <Select.Content align="start">
            <Select.Item value={DEFAULT_DEVICE} label="System default" />
            {#each devices.data ?? [] as device (device.id)}
              <Select.Item value={device.id} label={device.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      </dd>
    </div>
  </dl>

  {#if settings.artworkBackdrop !== null && settings.calmMotion !== null}
    <SettingsSwitchField
      id="artwork-backdrop"
      label="Artwork backdrop"
      class="mt-5 border-y"
      checked={settings.artworkBackdrop}
      onChange={(checked) => update({ artworkBackdrop: checked })}
    >
      Light the playback dock and Now Playing with the current track's artwork.
    </SettingsSwitchField>

    <SettingsSwitchField
      id="calm-motion"
      label="Calm motion"
      checked={settings.calmMotion}
      onChange={(checked) => update({ calmMotion: checked })}
    >
      Only what marks the current position moves on its own: the Light stops breathing and lyric
      characters stop lifting.
    </SettingsSwitchField>
  {/if}

  {#if settings.error}
    <p class="mt-3 text-sm text-destructive" role="alert">{settings.error}</p>
  {/if}
</section>
