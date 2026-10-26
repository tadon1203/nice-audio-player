<script lang="ts">
  import { type AppearancePatch } from "#lib/native/bindings";
  import { SignalPath } from "#lib/components/signal-path/signal-path.svelte";
  import { AppServices } from "#lib/app/app-services.svelte";
  import FlapText from "#lib/ui/rolling-number/flap-text.svelte";
  import SectionTitle from "#lib/ui/section-title.svelte";
  import * as Select from "#lib/ui/shadcn/select/index.js";
  import SettingsSwitchField from "./settings-switch-field.svelte";

  const DEFAULT_DEVICE = "default";

  const {
    player: playback,
    session,
    appearance,
    actions,
    notices,
    outputDevices,
  } = AppServices.current();
  const signalPath = new SignalPath();

  let deviceMenuOpen = $state(false);

  const path = $derived(signalPath.current);
  const selected = $derived(playback.outputDeviceId ?? DEFAULT_DEVICE);
  const outputLabel = $derived(
    path?.output ?? (playback.outputDeviceId !== null ? "Output" : "System default"),
  );
  const rows = $derived([
    { label: "Source", value: path?.source ?? "—" },
    { label: "Processing", value: path?.processing ?? "None" },
  ]);

  function chooseDevice(value: string): void {
    actions.run(
      () =>
        playback.setOutputSelection(
          value === DEFAULT_DEVICE
            ? { kind: "systemDefault" }
            : { kind: "device", deviceId: value },
        ),
      "settings",
    );
  }

  // The device list is read each time the menu opens, so a device connected since is offered.
  function listDevices(isOpen: boolean): void {
    if (isOpen) actions.run(() => outputDevices.refresh(), "settings");
  }

  const saveError = $derived(notices.at("settings")?.message ?? null);

  // The store rolls a failed change back; the error shows at the Settings place.
  function update(patch: AppearancePatch): void {
    actions.run(() => appearance.update(patch), "settings");
  }
</script>

<section aria-labelledby="playback-heading" class="mt-8">
  <SectionTitle id="playback-heading">Playback</SectionTitle>
  <p class="mt-1 text-sm leading-5 text-muted-foreground">
    The current signal path and how artwork glows the app.
  </p>

  <!-- A technical ledger: each signal-path stage on the Row index, next to its own setting. -->
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
          onOpenChange={listDevices}
        >
          <Select.Trigger
            disabled={session.connection !== "ready"}
            aria-label={`Output device: ${outputLabel}`}
            appearance="inline-value"
          >
            <span class="truncate tabular-nums">{outputLabel}</span>
          </Select.Trigger>
          <Select.Content align="start">
            <Select.Item value={DEFAULT_DEVICE} label="System default" />
            {#each outputDevices.devices as device (device.id)}
              <Select.Item value={device.id} label={device.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      </dd>
    </div>
  </dl>

  {#if appearance.artworkBackdrop !== null && appearance.calmMotion !== null}
    <SettingsSwitchField
      id="artwork-backdrop"
      label="Artwork backdrop"
      class="mt-5 border-y"
      checked={appearance.artworkBackdrop}
      onChange={(checked) => update({ artworkBackdrop: checked, calmMotion: null })}
    >
      Light the playback dock and Now Playing with the current track's artwork.
    </SettingsSwitchField>

    <SettingsSwitchField
      id="calm-motion"
      label="Calm motion"
      checked={appearance.calmMotion}
      onChange={(checked) => update({ artworkBackdrop: null, calmMotion: checked })}
    >
      Only what marks the current position moves on its own: the Artwork glow stops breathing and
      lyric characters stop lifting.
    </SettingsSwitchField>
  {/if}

  {#if saveError}
    <p class="mt-3 text-sm text-destructive" role="alert">{saveError}</p>
  {/if}
</section>
