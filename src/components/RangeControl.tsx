import { Slider } from "./ui/slider";

interface RangeControlProps {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  subdued?: boolean;
  "aria-label": string;
  "aria-valuetext"?: string;
  onValueChange: (value: number) => void;
  onValueCommitted?: (value: number) => void;
  onInteractionCancel?: () => void;
}

export function RangeControl({
  value,
  min,
  max,
  step,
  disabled = false,
  subdued = false,
  onValueChange,
  onValueCommitted,
  onInteractionCancel,
  ...aria
}: RangeControlProps) {
  const effectiveMax = max > min ? max : min + 1;
  return (
    <Slider
      value={value}
      min={min}
      max={effectiveMax}
      step={step}
      disabled={disabled}
      className={subdued ? "is-subdued" : undefined}
      onValueChange={(next) => onValueChange(typeof next === "number" ? next : (next[0] ?? min))}
      onValueCommitted={(next) =>
        onValueCommitted?.(typeof next === "number" ? next : (next[0] ?? min))
      }
      onPointerCancel={onInteractionCancel}
      {...aria}
    />
  );
}
