import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { interfaceEase, motionDurationSeconds, reducedMotionDurationSeconds } from "@/lib/motion";

interface DialogProps {
  title: string;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

export function Dialog({
  title,
  children,
  role = "dialog",
  onClose,
  initialFocusRef,
  fallbackFocusRef,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const root = document.getElementById("root");
    const returnFocusTarget =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallbackRef = fallbackFocusRef;
    root?.setAttribute("inert", "");
    initialFocusRef?.current?.focus();
    return () => {
      root?.removeAttribute("inert");
      const fallbackFocusTarget = fallbackRef?.current;
      const target = returnFocusTarget?.isConnected ? returnFocusTarget : fallbackFocusTarget;
      window.setTimeout(() => {
        if (target?.isConnected && !target.hasAttribute("disabled")) target.focus();
      }, 0);
    };
  }, [fallbackFocusRef, initialFocusRef]);
  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  const overlay = document.getElementById("overlay-root");
  if (!overlay) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(event) => event.stopPropagation()}>
      <motion.div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog"
        onKeyDown={trapFocus}
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: reducedMotion ? reducedMotionDurationSeconds : motionDurationSeconds.state,
          ease: interfaceEase,
        }}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </motion.div>
    </div>,
    overlay,
  );
}
