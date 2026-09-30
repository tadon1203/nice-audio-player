import { usePlaybackSignalPath } from "@/features/playback-signal-path";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  usePlaybackActions,
  usePlaybackOutput,
  usePlaybackTransport,
  useAudioOutputDevices,
} from "@/entities/playback";
import { useArtworkBackdrop, useCalmMotion } from "@/entities/settings";
import { SectionTitle } from "@/shared/ui/headings";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/shared/ui/menu";
import { Field, FieldLabel } from "@/shared/ui/shadcn/field";
import { FlapText } from "@/shared/ui/rolling-number";
import { Switch } from "@/shared/ui/shadcn/switch";

const DEFAULT_DEVICE = "default";

/** A technical ledger: each signal-path stage on the Gutter, next to its own setting. */
export function PlaybackSection() {
  const { connection } = usePlaybackTransport();
  const { outputSelection: selection } = usePlaybackOutput();
  const playback = usePlaybackActions();
  const path = usePlaybackSignalPath();
  const artworkBackdrop = useArtworkBackdrop();
  const calmMotion = useCalmMotion();
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const devices = useAudioOutputDevices(deviceMenuOpen);
  const selected = selection.kind === "device" ? selection.deviceId : DEFAULT_DEVICE;
  const outputLabel = path?.output ?? (selection.kind === "device" ? "Output" : "System default");

  const rows: { label: string; value: string }[] = [
    { label: "Source", value: path?.source ?? "—" },
    { label: "Processing", value: path?.processing ?? "None" },
  ];

  return (
    <section aria-labelledby="playback-heading" className="mt-8">
      <SectionTitle id="playback-heading">Playback</SectionTitle>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        The current signal path and how artwork lights the app.
      </p>

      <dl className="mt-5 divide-y divide-border border-y border-border text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-6 py-3">
            <dt className="w-16 shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 truncate tabular-nums text-foreground">
              <FlapText value={row.value} />
            </dd>
          </div>
        ))}
        <div className="flex items-center gap-6 py-3">
          <dt className="w-16 shrink-0 text-muted-foreground">Output</dt>
          <dd className="min-w-0">
            <Menu open={deviceMenuOpen} onOpenChange={setDeviceMenuOpen}>
              <MenuTrigger
                disabled={connection !== "ready"}
                aria-label={`Output device: ${outputLabel}`}
                className="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm text-foreground outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
              >
                <span className="truncate tabular-nums">{outputLabel}</span>
                <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
              </MenuTrigger>
              <MenuContent>
                <MenuRadioGroup
                  value={selected}
                  onValueChange={(value) =>
                    void playback.setOutputSelection(
                      value === DEFAULT_DEVICE
                        ? { kind: "systemDefault" }
                        : { kind: "device", deviceId: String(value) },
                    )
                  }
                >
                  <MenuRadioItem value={DEFAULT_DEVICE}>System default</MenuRadioItem>
                  {(devices.data ?? []).map((device) => (
                    <MenuRadioItem key={device.id} value={device.id}>
                      {device.name}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuContent>
            </Menu>
          </dd>
        </div>
      </dl>

      <Field
        orientation="horizontal"
        className="mt-5 items-center justify-between gap-6 border-y border-border py-3 text-sm"
      >
        <FieldLabel htmlFor="artwork-backdrop" className="flex-col items-start gap-0.5">
          <span className="font-normal text-foreground">Artwork backdrop</span>
          <span className="max-w-prose text-sm leading-5 font-normal text-muted-foreground">
            Light the playback dock and Now Playing with the current track's artwork.
          </span>
        </FieldLabel>
        <Switch
          id="artwork-backdrop"
          checked={artworkBackdrop.enabled}
          onCheckedChange={(checked) => artworkBackdrop.setEnabled(checked)}
          className="shrink-0"
        />
      </Field>

      <Field
        orientation="horizontal"
        className="items-center justify-between gap-6 border-b border-border py-3 text-sm"
      >
        <FieldLabel htmlFor="calm-motion" className="flex-col items-start gap-0.5">
          <span className="font-normal text-foreground">Calm motion</span>
          <span className="max-w-prose text-sm leading-5 font-normal text-muted-foreground">
            Only what marks the current position moves on its own: the Light stops breathing and
            lyric characters stop lifting.
          </span>
        </FieldLabel>
        <Switch
          id="calm-motion"
          checked={calmMotion.enabled}
          onCheckedChange={(checked) => calmMotion.setEnabled(checked)}
          className="shrink-0"
        />
      </Field>
    </section>
  );
}
