import type { ContentTransitionDirection } from "./ContentTransition";

type ContentTransitionTarget = {
  opacity: number;
  x?: number;
};

type ContentTransitionVariants = {
  initial: (direction: ContentTransitionDirection) => ContentTransitionTarget;
  animate: ContentTransitionTarget;
  exit: (direction: ContentTransitionDirection) => ContentTransitionTarget;
};

export const contentTransitionVariants: ContentTransitionVariants = {
  initial: (direction) => {
    if (direction === "forward") return { opacity: 0, x: 12 };
    if (direction === "backward") return { opacity: 0, x: -12 };
    return { opacity: 0 };
  },
  animate: { opacity: 1, x: 0 },
  exit: (direction) => {
    if (direction === "forward") return { opacity: 0, x: -8 };
    if (direction === "backward") return { opacity: 0, x: 8 };
    return { opacity: 0 };
  },
};

export const reducedContentTransitionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
