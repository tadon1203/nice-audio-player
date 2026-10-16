import { createContext } from "svelte";
import type { Appearance } from "./appearance.svelte";

export const [getAppearance, setAppearance] = createContext<Appearance>();
