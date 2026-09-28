import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  usePlaybackActions,
  usePlaybackOutput,
  usePlaybackSignalPath,
  usePlaybackTransport,
  useAudioOutputDevices,
} from "@/renderer/features/playback-control";
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/renderer/shared/ui/menu";

const DEFAULT_DEVICE = "default";

/** The thin ledger strip below the dock: signal path, fixed bottom-right. */
export function PlaybackStatusBar() {
  const transport = usePlaybackTransport();
  const controlsBusy = transport.pending !== null;

  return (
    <div
      className="flex h-7 shrink-0 items-center justify-end border-t border-border bg-background px-2 max-md:hidden md:px-4 lg:px-6"
      data-slot="playback-status-bar"
    >
      <SignalPath disabled={transport.connection !== "ready" || controlsBusy} />
    </div>
  );
}

/** `source › processing › output ▾`. Without resampling it reads `FLAC 24/96 › Speakers`. */
function SignalPath({ disabled }: { disabled: boolean }) {
  const path = usePlaybackSignalPath();
  const { outputSelection: selection } = usePlaybackOutput();
  const playback = usePlaybackActions();
  const [open, setOpen] = useState(false);
  const devices = useAudioOutputDevices(open);
  const selected = selection.kind === "device" ? selection.deviceId : DEFAULT_DEVICE;
  const outputLabel = path?.output ?? (selection.kind === "device" ? "Output" : "System default");
  const steps = path === null ? [] : [path.source, path.processing].filter((step) => step !== null);

  return (
    <div
      className="flex h-5 max-w-full min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
      role="group"
      aria-label="Signal path"
      data-region="signal-path"
    >
      {steps.map((step, index) => (
        <span key={index} className="flex shrink-0 items-center gap-1.5 tabular-nums">
          {step}
          <span aria-hidden="true">›</span>
        </span>
      ))}
      <Menu open={open} onOpenChange={setOpen}>
        <MenuTrigger
          disabled={disabled}
          aria-label={`Output device: ${outputLabel}`}
          className="flex min-w-0 cursor-pointer items-center gap-0.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
        >
          <span className="truncate">{outputLabel}</span>
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
    </div>
  );
}
