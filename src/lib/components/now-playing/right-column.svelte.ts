/**
 * What Now Playing's right column shows while a track has lyrics and the window is narrow (below
 * 90rem; wider, the queue is always in the rail). Remembered for the session: not reset on a
 * track change, not persisted.
 */
export const rightColumn = $state<{ view: "lyrics" | "queue" }>({ view: "lyrics" });
