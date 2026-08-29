import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Slider({
  className,
  "aria-label": ariaLabel,
  "aria-valuetext": ariaValueText,
  value,
  defaultValue,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root> & {
  "aria-label": string;
  "aria-valuetext"?: string;
}) {
  const values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [value];
  return (
    <SliderPrimitive.Root
      {...props}
      value={value}
      defaultValue={defaultValue}
      data-slot="slider"
      thumbAlignment="edge"
      className={cn("range-control", className)}
    >
      <SliderPrimitive.Control className="range-control__control">
        <SliderPrimitive.Track data-slot="slider-track" className="range-control__track">
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="range-control__indicator"
          />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            index={index}
            data-slot="slider-thumb"
            className="range-control__thumb"
            getAriaLabel={() => ariaLabel}
            aria-valuetext={ariaValueText}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
