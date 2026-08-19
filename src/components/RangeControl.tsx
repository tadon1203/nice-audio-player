import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { effectsMotion } from "@/lib/motion";

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
  onInteractionStart?: () => void;
  onValueCommit?: (value: number) => void;
  onInteractionCancel?: () => void;
}

function ratio(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

const commitKeys = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

export function RangeControl({
  value,
  min,
  max,
  step,
  disabled = false,
  subdued = false,
  onValueChange,
  onInteractionStart,
  onValueCommit,
  onInteractionCancel,
  ...aria
}: RangeControlProps) {
  const pointerActive = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const reducedMotion = useReducedMotion();
  const progress = ratio(value, min, max);
  const positionTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: isActive || keyboardActive ? 0 : effectsMotion.state,
        ease: effectsMotion.ease,
      };
  const commit = (next: number) => onValueCommit?.(next);
  const handlePointerDown = (_event: PointerEvent<HTMLInputElement>) => {
    pointerActive.current = true;
    setIsActive(true);
    onInteractionStart?.();
  };
  const handlePointerUp = (event: PointerEvent<HTMLInputElement>) => {
    if (!pointerActive.current) return;
    pointerActive.current = false;
    setIsActive(false);
    commit(Number(event.currentTarget.value));
  };
  const handleKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!commitKeys.has(event.key)) return;
    commit(Number(event.currentTarget.value));
    setKeyboardActive(false);
  };
  return (
    <span
      className={`range-control${subdued ? " is-subdued" : ""}${disabled ? " is-disabled" : ""}${isHovered ? " is-hovered" : ""}${isActive ? " is-active" : ""}`}
      data-progress={progress}
      data-position-motion={reducedMotion || isActive || keyboardActive ? "immediate" : "settled"}
      data-interaction-state={isActive ? "active" : isHovered ? "hover" : "idle"}
    >
      <span className="range-control__track" aria-hidden="true" />
      <motion.span
        className="range-control__fill-position"
        aria-hidden="true"
        animate={{ scaleX: progress }}
        initial={false}
        transition={positionTransition}
        data-progress={progress}
      >
        <span className="range-control__fill-visual" />
      </motion.span>
      <motion.span
        className="range-control__thumb-position"
        aria-hidden="true"
        animate={{ x: `${progress * 100}%` }}
        initial={false}
        transition={positionTransition}
        data-progress={progress}
      >
        <span className="range-control__thumb-visual">
          <span className="range-control__thumb-ring" />
        </span>
      </motion.span>
      <input
        {...aria}
        className="range-control__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(Number(event.currentTarget.value))}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pointerActive.current = false;
          setIsActive(false);
          onInteractionCancel?.();
        }}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        onKeyUp={handleKeyUp}
        onKeyDown={(event) => {
          if (commitKeys.has(event.key)) setKeyboardActive(true);
        }}
        onBlur={() => setKeyboardActive(false)}
      />
    </span>
  );
}
