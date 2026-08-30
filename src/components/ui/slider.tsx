import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import type { ComponentProps } from "react";
export type SliderAppearance = "default" | "subdued" | "idle" | "pending";

export function Slider({
  appearance = "default",
  "aria-label": ariaLabel,
  "aria-valuetext": ariaValueText,
  value,
  defaultValue,
  ...props
}: Omit<ComponentProps<typeof SliderPrimitive.Root>, "className"> & {
  "aria-label": string;
  "aria-valuetext"?: string;
  appearance?: SliderAppearance;
}) {
  const values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [value];
  const pending = appearance === "pending";
  const subdued = appearance === "subdued";
  const idle = appearance === "idle";
  return (
    <SliderPrimitive.Root
      {...props}
      value={value}
      defaultValue={defaultValue}
      data-slot="slider"
      thumbAlignment="edge"
      className={`w-full min-w-0 ${idle ? "opacity-[.55]" : pending ? "opacity-100" : "data-[disabled]:opacity-70"}`}
    >
      <SliderPrimitive.Control className="group/slider-control relative flex min-h-10 w-full min-w-0 touch-none select-none items-center forced-colors:outline forced-colors:outline-ButtonText">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={`relative h-1 min-w-0 flex-1 overflow-hidden rounded-full transition-colors duration-[var(--effect-feedback)] ease-interface ${subdued ? "bg-border-control" : pending ? "bg-text-secondary" : "bg-border-control"} group-hover/slider-control:bg-text-secondary group-data-[disabled]/slider-control:bg-surface-pressed forced-colors:bg-[CanvasText] forced-colors:opacity-[.35]`}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={`h-full transition-colors duration-[var(--effect-state)] ease-interface ${subdued ? "bg-text-muted" : "bg-text-primary"} group-data-[disabled]/slider-control:bg-text-disabled ${pending ? "group-data-[disabled]/slider-control:bg-text-primary" : ""} forced-colors:bg-[Highlight]`}
          />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            index={index}
            data-slot="slider-thumb"
            className={`block h-4 w-4 flex-none rounded-full border-0 transition-colors duration-[var(--effect-state)] ease-interface focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2 ${subdued ? "bg-text-muted" : "bg-text-primary"} group-data-[disabled]/slider-control:bg-text-disabled ${pending ? "group-data-[disabled]/slider-control:bg-text-primary" : ""} forced-colors:bg-[Highlight] forced-colors:focus-visible:outline-[Highlight]`}
            getAriaLabel={() => ariaLabel}
            aria-valuetext={ariaValueText}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
