import { createContext } from "svelte";
import type { Playback } from "./playback.svelte";

export const [getPlayback, setPlayback] = createContext<Playback>();
