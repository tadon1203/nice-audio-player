# Research: what does Symphonia 0.6 give us for gapless playback?

Question (from a codebase-review ticket on media keys and gapless): which formats does Symphonia 0.6.0 trim for encoder delay and padding, and what does the app have to do itself?

Research date: 2026-10-03. Sources: the Symphonia 0.6.0 source as vendored in `~/.cargo/registry/src/*/symphonia-*-0.6.0/` (cited `core:`, `mp3:`, `isomp4:`). No hardware or sample files were needed; nothing here was observed by decoding a real LAME or iTunes file, so each claim is marked **[verified]** (read in the cited source) or **[inferred]**.

## Answer

1. **The API is `AudioDecoderOptions { gapless }`, and it is on by default.** [verified] `core:codecs/audio.rs:211-236`: `gapless: true` in `Default`. The app builds its decoder with `AudioDecoderOptions::default()` (`backend/src/audio/decoding.rs`), so trimming needs no code where a format supports it.
2. **Trim data travels on the packet.** [verified] `core:packet.rs:46-72`: a packet has `dur`, `trim_start` and `trim_end`; the decoder drops that many frames from the decoded buffer. The format reader fills them in.
3. **MP3: trimmed.** [verified] The demuxer reads the LAME/Xing tag's encoder delay and padding (`mp3:demuxer.rs:426-446`, `:839-846`), starts the track at timestamp `-delay`, and puts the trims on the first and last packets; the decoder calls `buf.trim(packet.trim_start, packet.trim_end)` when `gapless` is on (`mp3:decoder.rs:129-132`). Files without a LAME tag are not trimmed (best effort, as the ticket says).
4. **FLAC and WAV: sample-exact.** [inferred] They carry no encoder delay; the decoded length is the track length.
5. **M4A (AAC / ALAC in MP4): not trimmed by Symphonia 0.6.0.** [verified] The `isomp4` reader parses the `edts`/`elst` atoms (`isomp4:atoms/edts.rs`, `elst.rs`) but nothing outside the atom modules reads them, and the reader sets no `trim_start`/`trim_end` and no track delay. iTunes' `iTunSMPB` tag is not read either. An AAC file therefore plays with its priming samples (typically 1024-2112 frames, 25-50 ms) and padding at the ends. This is a known limit, not a bug in the player's handover: the stream is gapless, the file carries a short silence of its own.
6. **Seeking and trim share a timeline.** [inferred] For MP3 the track starts at a negative timestamp, so the position the app reports after a seek is relative to the trimmed start; the existing seek code asks the format for an accurate seek to a time and discards the pre-roll, which is unchanged.

## What the app does about it

- Leaves `gapless` on (the default) and relies on MP3 trimming.
- Does not trim M4A itself. A follow-up could read `iTunSMPB` (lofty already parses it as a freeform tag) or the `elst` entry and drop the leading and trailing frames in `StreamingDecoder::decode_next`; it must then also adjust seek targets. Not done: it touches seeking, and the ticket allows best effort where a format has no trim support.
- The output side is gapless on its own: the stream keeps playing across tracks of the same format and the callback moves to the next track's queue inside one buffer (ADR 0003).
