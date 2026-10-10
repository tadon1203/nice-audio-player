import { createContext } from "svelte";
import type { LibraryScanState } from "./library-scan-state.svelte";

export const [getLibraryScan, setLibraryScan] = createContext<LibraryScanState>();
