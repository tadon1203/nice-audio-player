import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { interfaceEase, motionDurationSeconds, reducedMotionDurationSeconds } from "@/lib/motion";

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
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: motionDurationSeconds.state, ease: interfaceEase };
  const leftPath = playing ? "M7 5L10 5L10 19L7 19Z" : "M8 5L18 12L8 19L8 5Z";
  const rightPath = playing ? "M14 5L17 5L17 19L14 19Z" : "M12 12L12 12L12 12L12 12Z";
  return (
    <Svg className={className}>
      {reducedMotion ? (
        <AnimatePresence initial={false} mode="sync">
          <motion.g
            key={playing ? "pause" : "play"}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: reducedMotionDurationSeconds, ease: interfaceEase }}
          >
            <path d={leftPath} fill="currentColor" />
            <path d={rightPath} fill="currentColor" />
          </motion.g>
        </AnimatePresence>
      ) : (
        <>
          <motion.path
            animate={{ d: leftPath }}
            d={leftPath}
            fill="currentColor"
            initial={false}
            transition={transition}
          />
          <motion.path
            animate={{ d: rightPath }}
            d={rightPath}
            fill="currentColor"
            initial={false}
            transition={transition}
          />
        </>
      )}
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

export function VolumeIcon({
  state,
  className,
}: {
  state: "silent" | "low" | "high";
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const innerWave =
    state === "silent" ? "M16 12 C16 12 16 12 16 12" : "M16 9.5 C17.8 10.8 17.8 13.2 16 14.5";
  const outerWave = state === "high" ? "M19 7.5 C22 10 22 14 19 16.5" : "M19 12 C19 12 19 12 19 12";
  const muteSlash =
    state === "silent" ? "M4.5 4.5 C9.5 9.5 15 15 20.5 20.5" : "M12.5 12 C12.5 12 12.5 12 12.5 12";
  const transition = {
    duration: motionDurationSeconds.state,
    ease: interfaceEase,
  };
  return (
    <Svg className={className}>
      <path d="M5 10v4h3l4 3V7l-4 3H5Z" fill="currentColor" />
      <g data-reduced-motion={reducedMotion ? "true" : "false"} data-volume-icon-state={state}>
        {reducedMotion ? (
          <AnimatePresence initial={false} mode="sync">
            <motion.g
              key={state}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: interfaceEase }}
            >
              <path
                d={innerWave}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.7"
              />
              <path
                d={outerWave}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.7"
              />
              <path
                d={muteSlash}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.7"
              />
            </motion.g>
          </AnimatePresence>
        ) : (
          <>
            <motion.path
              animate={{ d: innerWave, opacity: state === "silent" ? 0.25 : 1 }}
              d={innerWave}
              fill="none"
              initial={false}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
              transition={transition}
            />
            <motion.path
              animate={{ d: outerWave, opacity: state === "high" ? 1 : 0 }}
              d={outerWave}
              fill="none"
              initial={false}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
              transition={transition}
            />
            <motion.path
              animate={{ d: muteSlash, opacity: state === "silent" ? 1 : 0 }}
              d={muteSlash}
              fill="none"
              initial={false}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
              transition={transition}
            />
          </>
        )}
      </g>
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
