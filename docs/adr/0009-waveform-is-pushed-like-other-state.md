# 0009: The waveform is pushed like every other state

The backend sends the waveform itself (`waveformChanged`, with the playback id it was read for), instead of a "ask again" signal.

- ADR 0003 has the host read the current state and forward it. The waveform was the one event that carried none, so the renderer had to pull after being told: a pull started before the analysis finished could resolve with "not yet" after the signal, and `staleTime: Infinity` kept that answer until Now Playing was reopened.
- The renderer writes a pushed waveform into its cache, cancelling a fetch in flight first, as it does for the scan state. The command stays only for a track whose waveform was ready before anyone watched; it answers for the loaded track, and the renderer keeps the answer only under the playback id it carries.
- The event pairs the waveform with the playback id from the same snapshot that chose the file, so a waveform cannot be drawn for another track. A playback nobody watches is not cached, so nothing outlives the loaded track.
- Alternatives rejected: polling a pending state (an unneeded timer, and the push already exists), and keeping the signal with a cancel-before-invalidate (closes the known race but leaves the pull-after-signal protocol that produced it).
