import { createContext } from "svelte";
import type { Settings } from "./settings.svelte";

export const [getSettings, setSettings] = createContext<Settings>();
