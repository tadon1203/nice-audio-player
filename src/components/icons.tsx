import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

function Svg({ children, className = "size-6" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function PlayPauseIcon({ playing, className }: { playing: boolean; className?: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <Svg className={className}>
      <motion.path
        animate={{ d: playing ? "M7 5L10 5L10 19L7 19Z" : "M8 5L18 12L8 19Z" }}
        d="M8 5L18 12L8 19Z"
        fill="currentColor"
        initial={false}
        transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        animate={{ d: playing ? "M14 5L17 5L17 19L14 19Z" : "M12 12L12 12L12 12Z" }}
        d="M12 12L12 12L12 12Z"
        fill="currentColor"
        initial={false}
        transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      />
    </Svg>
  );
}

export function StopIcon() {
  return (
    <Svg>
      <path d="M7 7h10v10H7z" fill="currentColor" />
    </Svg>
  );
}

export function VolumeIcon({ muted, className }: { muted: boolean; className?: string }) {
  const reducedMotion = useReducedMotion();
  const transition = {
    duration: reducedMotion ? 0 : 0.22,
    ease: [0.22, 1, 0.36, 1] as const,
  };
  return (
    <Svg className={className}>
      <path d="M5 10v4h3l4 3V7l-4 3H5Z" fill="currentColor" />
      <motion.path
        animate={{ opacity: muted ? 0 : 1 }}
        d="M16 9.5a4 4 0 0 1 0 5"
        fill="none"
        initial={false}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        transition={transition}
      />
      <motion.path
        animate={{ opacity: muted ? 1 : 0 }}
        d="m16 9 4 6m0-6-4 6"
        fill="none"
        initial={false}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
        transition={transition}
      />
    </Svg>
  );
}

export function RefreshIcon() {
  return (
    <Svg>
      <path
        d="M19 8V4m0 0h-4m4 0-3 3a7 7 0 1 0 1.5 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </Svg>
  );
}

export function OutputDeviceIcon() {
  return (
    <Svg>
      <path
        d="M4 7h16v10H4zM8 20h8M9 17h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </Svg>
  );
}
