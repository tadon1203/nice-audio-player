//! Decoding: opens a compressed source and decodes it to interleaved PCM. It knows nothing of
//! playback, threads, or the output; callers drive it one packet at a time.

mod source;
mod stream;

pub(crate) use source::CompressedAudioSource;
pub(crate) use stream::{DecodeError, DecodeStep, StreamingDecoder};
