/**
 * What Now Playing's right column shows: the lyrics, the queue or the meters. Below 90rem the
 * switch chooses one of the three (the queue is always the rail from 90rem, beside lyrics or
 * meters). Remembered for the session: not reset on a track change, not persisted.
 */
export const rightColumn = $state<{ view: "lyrics" | "queue" | "meters" }>({ view: "lyrics" });
