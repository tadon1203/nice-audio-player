import { getContext, setContext } from "svelte";

const key = Symbol("floating-layer");
const base = { panel: 70, popup: 80, dialog: 90 } as const;

/** Body portals retain Svelte context, so nested popups rise above their caller. */
export function floatingLayer(role: keyof typeof base): number {
  const parent = getContext<number | undefined>(key);
  const layer = Math.max(base[role], (parent ?? 0) + 10);
  setContext(key, layer);
  return layer;
}
