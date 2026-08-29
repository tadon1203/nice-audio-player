import type { AudioOutputDevice, AudioOutputSelection } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
interface AudioOutputSettingsProps {
  outputDevices: AudioOutputDevice[] | null;
  selectedOutput: AudioOutputSelection;
  onOutputSelectionChange(value: AudioOutputSelection): void;
  onRefreshDevices(): void;
  outputDisabled: boolean;
}
export function AudioOutputSettings({
  outputDevices,
  selectedOutput,
  onOutputSelectionChange,
  onRefreshDevices,
  outputDisabled,
}: AudioOutputSettingsProps) {
  const selectedValue =
    selectedOutput.kind === "device" ? selectedOutput.deviceId : "systemDefault";
  const selectedLabel =
    selectedOutput.kind === "device"
      ? (outputDevices?.find((device) => device.id === selectedOutput.deviceId)?.name ??
        selectedOutput.deviceId)
      : "System default";
  function handleValueChange(value: string | null) {
    if (!value || value === "systemDefault") onOutputSelectionChange({ kind: "systemDefault" });
    else onOutputSelectionChange({ kind: "device", deviceId: value });
  }
  return (
    <section className="settings-view__section">
      <h2 className="type-section-title">Audio</h2>
      <p>Configure playback output and device settings.</p>
      <div className="settings-view__output">
        <Field>
          <FieldLabel id="output-device-label">Output device</FieldLabel>
          <Select value={selectedValue} disabled={outputDisabled} onValueChange={handleValueChange}>
            <SelectTrigger aria-labelledby="output-device-label">
              <SelectValue>{selectedLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="systemDefault">System default</SelectItem>
                {outputDevices?.map((device) => (
                  <SelectItem value={device.id} key={device.id}>
                    {device.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Button type="button" disabled={outputDisabled} onClick={onRefreshDevices}>
          Refresh
        </Button>
      </div>
    </section>
  );
}
