//! The audio stages: decode, output, pcm, processing and waveform, and the `fake_output` double.

pub(crate) mod decode;
#[cfg(test)]
pub(crate) mod fake_output;
pub(crate) mod output;
pub(crate) mod pcm;
pub(in crate::player) mod pipeline;
pub(crate) mod processing;
pub(crate) mod waveform;
