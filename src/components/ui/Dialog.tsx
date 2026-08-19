import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { effectsMotion } from "@/lib/motion";

interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
}

function DialogPresence({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div
      className="dialog-presence"
      data-state={present ? "open" : "closing"}
      inert={!present || undefined}
      aria-hidden={!present || undefined}
    >
      {children}
    </div>
  );
}

export function Dialog({
  open,
  title,
  children,
  role = "dialog",
  onClose,
  initialFocusRef,
  fallbackFocusRef,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root?.setAttribute("inert", "");
      initialFocusRef?.current?.focus({ preventScroll: true });
      return;
    }
    root?.removeAttribute("inert");
    const target = returnFocusRef.current?.isConnected
      ? returnFocusRef.current
      : fallbackFocusRef?.current;
    returnFocusRef.current = null;
    if (target?.isConnected && !target.hasAttribute("disabled")) {
      target.focus({ preventScroll: true });
    }
  }, [fallbackFocusRef, initialFocusRef, open]);
  useLayoutEffect(
    () => () => {
      document.getElementById("root")?.removeAttribute("inert");
      const target = returnFocusRef.current?.isConnected
        ? returnFocusRef.current
        : fallbackFocusRef?.current;
      returnFocusRef.current = null;
      if (target?.isConnected && !target.hasAttribute("disabled")) {
        target.focus({ preventScroll: true });
      }
    },
    [fallbackFocusRef],
  );
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
  const enterDuration = reducedMotion ? effectsMotion.reduced : effectsMotion.state;
  const exitDuration = reducedMotion ? effectsMotion.reduced : effectsMotion.feedback;
  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="dialog"
          className="dialog-backdrop"
          onMouseDown={(event) => event.stopPropagation()}
          initial={{ backgroundColor: "rgb(0 0 0 / 0%)" }}
          animate={{ backgroundColor: "rgb(0 0 0 / 60%)" }}
          exit={{
            backgroundColor: "rgb(0 0 0 / 0%)",
            transition: { duration: exitDuration, ease: effectsMotion.ease },
          }}
          transition={{ duration: enterDuration, ease: effectsMotion.ease }}
        >
          <DialogPresence>
            <motion.div
              ref={dialogRef}
              role={role}
              aria-modal="true"
              aria-labelledby={titleId}
              className="dialog"
              onKeyDown={trapFocus}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: exitDuration, ease: effectsMotion.ease },
              }}
              transition={{ duration: enterDuration, ease: effectsMotion.ease }}
            >
              <h2 id={titleId}>{title}</h2>
              {children}
            </motion.div>
          </DialogPresence>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    overlay,
  );
}
