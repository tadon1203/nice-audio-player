import type { ReactNode } from "react";
import { LazyMotion, LayoutGroup, MotionConfig } from "motion/react";

const loadFeatures = () => import("./motion-features").then((module) => module.default);

/**
 * App-wide motion setup. `LayoutGroup` scopes shared-element (`layoutId`) transitions to
 * the whole shell so an object can move between the dock, Now Playing, and the library.
 * `reducedMotion="user"` drops transform/layout animation; tokens fall back to a short
 * crossfade via `useMotionTransition`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        <LayoutGroup id="app">{children}</LayoutGroup>
      </LazyMotion>
    </MotionConfig>
  );
}
